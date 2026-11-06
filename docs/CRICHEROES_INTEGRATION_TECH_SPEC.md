# CricHeroes Tournament API (v1) — Integration Plan & Tech Spec

**Status:** Phases 1–3 implemented (§12), all 19 endpoints fully modelled from
the API doc (§8), including the two MVP endpoints CricHeroes added. Not yet run
against real credentials. Moved to the MediaHubble doc of 4 Nov 2026 (§13.12),
which changed every path, the `device-type` header and every error code, and
serves us two tournaments only. CricHeroes have closed the scope beyond that
(§13.11).
**Owner:** Backend
**Scope:** `apps/backend`
**Upstream:** `https://cricheroes.in/api/v1`, "MediaHubble" resource group (19 GET endpoints)
**Sources:** the CricHeroes API doc (MediaHubble build of 4 Nov 2026:
endpoints, payloads, error codes) and their written answers on plan, quota,
rate limits and SLA (§6), and on the follow-up questions (§13.4–13.11).

---

## 1. Summary

Add a typed, async server-side client for the CricHeroes third-party tournament
API, plus a small set of admin-gated FastAPI routes that expose the
tournament-level portion of it.

The client covers **all 19** documented endpoints so any of them can be called
from server code (imports, scheduled syncs, future screens). Only the
**tournament-level 9** get HTTP routes today — routes are cheap to add later,
and every route we publish is upstream quota exposed to a caller.

That last point is not rhetorical. The plan is 100,000 calls per **year**, and
the quota — not the rate limit — is what constrains this integration. §6 costs
it out.

### Decisions already taken

| Question | Decision |
|---|---|
| Which endpoints get routes | Tournament-level set (9), client covers all 19 |
| Response model fidelity | Full fidelity, lenient — model every documented field, allow unknown extras |
| Route access | **Platform admins only** (`get_platform_admin`) — §9. Originally "admin-only" via `get_admin_user`, which `main` has since replaced with separate platform and tournament admins |
| Caching | Out of scope here (no caller yet), but a **hard precondition** on the first polling caller — §6.3 |
| 429 handling | Own exception, surfaced as 429. **No automatic retry by default** — CricHeroes charge a 429 like a 200 (§6.5, §13.4) |

---

## 2. Goals / Non-goals

**Goals**

- One typed method per documented endpoint, returning parsed Pydantic models.
- Credentials read from the environment via `pydantic-settings`; never inline.
- Failure modes distinguishable at a glance — especially "credentials missing"
  vs "credentials rejected" vs "upstream has no such tournament".
- A cheap way to verify real credentials once we have them.
- Match the existing service-layer conventions in `apps/backend`.

**Non-goals (this change)**

- No persistence of CricHeroes data beyond what keeps the quota in check: the
  call counter (§6.6) and the cache (§6.7). The player import (§9.1) creates
  or links our own `Player` documents.
- No fuzzy matching of CricHeroes players onto ours. The player import (§9.1)
  links by exact name only where that is unambiguous; anything else is linked
  explicitly through the sheet import (§13.2).
- No webhook ingestion, and no live polling during play. The cache (§6.7) is
  refreshed on a schedule and driven by completed results, so standings,
  MVP and leaderboards are a match behind while one is in play.
- No fantasy points computation. CricHeroes' MVP points are served as they are
  (§13.5); whether they can stand in for our fantasy points is a product
  decision, and `Player.points` has no per-tournament dimension today.
- No frontend work beyond the import button (§9.1).
- No public (unauthenticated) exposure of any CricHeroes data.

---

## 3. Architecture

```
apps/backend/
├── config/settings.py                        (modified)  CRICHEROES_* settings
├── app/
│   ├── schemas/cricheroes.py                 (new)  response models (§8)
│   ├── services/
│   │   ├── cricheroes_client.py              (new)  CricHeroesClient, 19 methods
│   │   ├── cricheroes_errors.py              (new)  exception taxonomy
│   │   └── cricheroes_roster.py              (new)  player import (§9.1)
│   └── routes/admin/cricheroes.py            (new)  9 read routes + player import
├── scripts/check_cricheroes_credentials.py   (new)  live smoke check
└── tests/
    ├── test_cricheroes_client.py             (new)
    └── test_cricheroes_routes.py             (new)
```

Wiring touches three existing files by two lines each: `main.py`
(`include_router`), `app/routes/admin/__init__.py` (export), and
`app/services/__init__.py` (export).

**Layering.** Routes never build HTTP requests; they call the client and
translate its exceptions to status codes. The client never raises `HTTPException`
and never imports FastAPI, so it is equally usable from a script or a background
job. Exceptions live in their own module so routes can import them without
pulling in `httpx`.

---

## 4. Configuration

New settings on the existing `Settings` class, following the established
`Field(default=..., alias=...)` pattern:

| Setting | Env var | Default | Required |
|---|---|---|---|
| `cricheroes_base_url` | `CRICHEROES_BASE_URL` | `https://cricheroes.in/api/v1` | no |
| `cricheroes_api_key` | `CRICHEROES_API_KEY` | `None` | yes, at call time |
| `cricheroes_secret_access_key` | `CRICHEROES_SECRET_ACCESS_KEY` | `None` | yes, at call time |
| `cricheroes_udid` | `CRICHEROES_UDID` | `None` | yes, at call time |
| `cricheroes_timeout_seconds` | `CRICHEROES_TIMEOUT_SECONDS` | `15.0` | no |
| `cricheroes_max_retries` | `CRICHEROES_MAX_RETRIES` | `0` | no |
| `cricheroes_annual_quota` | `CRICHEROES_ANNUAL_QUOTA` | `100000` | no — the call counter's yardstick (§6.6) |
| `cricheroes_quota_term_start` | `CRICHEROES_QUOTA_TERM_START` | unset (or blank): the last 365 days | no — the first day of any term, `YYYY-MM-DD` |
| `cricheroes_usage_warn_percent` | `CRICHEROES_USAGE_WARN_PERCENT` | `50` | no |
| `cricheroes_sync_tournament_ids` | `CRICHEROES_SYNC_TOURNAMENT_IDS` | empty: nothing cached | for the cache (§6.7), e.g. `2242502,2251924` |
| `cricheroes_snapshot_max_age_hours` | `CRICHEROES_SNAPSHOT_MAX_AGE_HOURS` | `24` | no |

The timeout must be positive and the retry count non-negative; a bad value fails
at startup rather than at the first call. So must every
`CRICHEROES_SYNC_TOURNAMENT_IDS` entry be a positive number: a typo would
otherwise only show as a cache that quietly stays empty.

`cricheroes_timeout_seconds` defaults **below** the 30s upstream allows — see
§6.4 for why. `cricheroes_max_retries` applies to 429 only (§6.5), and is `0` —
no retries — because CricHeroes confirmed a 429 is charged against the quota.

The three credentials are **optional at import time** and validated **at call
time**. Making them required would break every existing deployment, every test
run, and every unrelated script the moment this merges — `Settings()` is
instantiated at import in `config/settings.py`.

`.env.example` gains a documented block. Real values go in the monorepo-root
`.env` and in the Railway environment.

> ⚠️ **Use the credentials CricHeroes issued us, not the doc's.** The doc of
> 30 May 2025 printed example values that will be rejected. The MediaHubble
> doc of 4 Nov 2026 prints an `api-key` and a `udid` in every example request,
> and a placeholder, `<SECRET_ACCESS_KEY>`, for the secret; whether those two
> are ours is unconfirmed (§13.12). Either way the values live in the
> environment only — never in the repository. The test fixture leaves the
> doc's request headers out for that reason.

**Dependency change:** `httpx==0.27.2` moves from the dev block of
`requirements.txt` to the runtime block. It is already pinned and already
installed — this only reclassifies it, since `app/services/auth/twofactor.py`
already imports it at runtime today.

---

## 5. Client design

### 5.1 Request headers

Every request carries the five documented headers, under
`/thirdparty/mediahubble/`. `device-type` is a constant
(`thirdparty-media-hubble`): our credentials are for the "MediaHubble" resource
group. The doc of 30 May 2025 had a generic "Client" group
(`/thirdparty/client/`, `thirdparty-client`); the doc of 4 Nov 2026 replaced
it, so a client still sending those reaches nothing.

```
Content-Type: application/json
api-key: <CRICHEROES_API_KEY>
secret_access_key: <CRICHEROES_SECRET_ACCESS_KEY>
udid: <CRICHEROES_UDID>
device-type: thirdparty-media-hubble
User-Agent: WalleArena/1.0 (+https://wallearena.com)
```

The `User-Agent` is not in the doc, but it is required. CricHeroes' Cloudflare
firewall answers httpx's default (`python-httpx/…`) with a 403 and code
20250529 before any credential check (§7). On 6 Nov 2026, a request with our
real credentials and this User-Agent got `status: true`. `USER_AGENT` in the
client holds it; check that a new value still gets through before changing it.

If any credential is missing, the client raises **before** opening a connection
and names the missing environment variables. A partial header set is rejected
upstream the same way a wrong one is, so "some credentials" is treated as "not
configured" rather than spending a request to find out.

### 5.2 Lifecycle

`CricHeroesClient` is an async context manager holding one `httpx.AsyncClient`
(one connection pool) for its lifetime. A client it creates itself is closed on
exit; an injected one is left alone, so tests and any future shared app-wide
pool are not closed out from under their owner.

Constructor takes optional overrides for every credential, the base URL, the
timeout, and the underlying `httpx.AsyncClient` — the last is the test seam.

### 5.3 Response envelope

Every documented response is `{"status": bool, "data": ...}` or
`{"status": false, "error": {"code", "message"}}`. The client unwraps `data` and
raises on `status: false`, so callers never inspect a status flag.

Two shapes are handled by shared helpers: endpoints whose `data` is a single
object, and endpoints whose `data` is a list. `get-tournament-boundary-count` is
documented as a single object wrapped in a one-element list; that is unwrapped
transparently so the method returns an object, not a list of one.

### 5.4 Query parameters

Optional parameters are dropped when unset. Sending `?teamId=` is not equivalent
to omitting it upstream. Python-side names are snake_case (`team_id`,
`round_id`, `group_id`); they are serialised to the upstream spellings
(`teamId`, `roundId`, `groupId`, `sort_filter`).

### 5.5 Method inventory (19)

**Match (6)**

| Method | Upstream path |
|---|---|
| `get_match_playing_squad(match_id, team_id=None)` | `get-match-playing-squad/{matchId}` |
| `get_match_current_partnership(match_id)` | `get-match-current-partnership/{matchId}` |
| `get_match_partnership(match_id, team_id)` | `get-match-partnership/{matchId}/{teamId}` |
| `get_match_manhattan_graph(match_id)` | `get-match-manhattan-graph/{matchId}` |
| `get_match_worm_graph(match_id)` | `get-match-worm-graph/{matchId}` |
| `get_match_player_mvp(match_id)` | `get-match-player-mvp/{matchId}` |

> The two partnership endpoints return different shapes: the current
> partnership is one object, the per-team one a *list*. The doc of 30 May 2025
> gave them the same path, told apart only by the trailing `teamId`; the doc of
> 4 Nov 2026 gives the per-team one its own. Each path has a test.

**Tournament (6)**

| Method | Upstream path |
|---|---|
| `get_tournament_boundary_count(tournament_id)` | `get-tournament-boundary-count/{id}` |
| `get_player_tournament_match_batting_data(tournament_id, player_id)` | `get-player-tournament-match-batting-data/{tid}/{pid}` |
| `get_player_tournament_match_bowling_data(tournament_id, player_id)` | `get-player-tournament-match-bowling-data/{tid}/{pid}` |
| `get_tournament_match_list(tournament_id, match_type=, team_id=, order=)` | `get-tournament-match-list/{id}` — `match_type` is sent as `type` |
| `get_tournament_point_table(tournament_id, round_id=, group_id=)` | `get-tournament-point-table/{id}` |
| `get_tournament_player_mvp(tournament_id)` | `get-tournament-player-mvp/{id}` |

Only two tournament ids are served (§13.12). Every tournament endpoint except
the MVP one also takes `-1`, meaning both.

**Leaderboards (5)**

| Method | `sort_filter` values |
|---|---|
| `get_tournament_batting_leaderboard` | RUN, HS, HSR, HAVG, MSIX, MFOUR, MFIFTY, MCENTURY |
| `get_tournament_inning_batting_leaderboard` | MIHS, MISIX, MIFOUR, MIHSR |
| `get_tournament_bowling_leaderboard` | WICKET, MMOVB, MODB, MBAVG, MBECO, MBSR, BB |
| `get_tournament_inning_bowling_leaderboard` | MIMDB, MIBBE, MIBB, MIMRC |
| `get_tournament_leaderboard_stats_filter` | — (discovery endpoint) |

**Player season stats (2)**

| Method | Upstream path |
|---|---|
| `get_player_batting_season_data(player_id)` | `get-player-batting-season-data/{playerId}` |
| `get_player_bowling_season_data(player_id)` | `get-player-bowling-season-data/{playerId}` |

---

## 6. Quota, rate limits and caching

Source: CricHeroes "API requests / queries" answers (commercial + ops), received
after the first draft of this spec. This section supersedes the earlier
assumption that no limits were published.

### 6.1 The published numbers

| Parameter | Value |
|---|---|
| Included quota | **100,000 calls per 12-month term** (₹60,000 prepaid) |
| Rollover | None — unused calls expire at end of term |
| Grace allowance | 10% above quota (110,000) before billing |
| Overage | Pay-as-you-go, ₹0.50–0.75 / call depending on top-up bundle |
| Quota scope | Account-wide, across all our tournaments/associations |
| Rate limit | **50 requests/second per API key**, HTTP 429 over it |
| Request timeout | 30s upstream |
| Typical response | <500ms cached, <2s live tournament data |
| Max payload | 3 MB per request |
| Uptime SLA | 99% monthly, service credits at CricHeroes' discretion |
| Outage handling | Failed calls from **platform-side** outages are not charged to quota |
| Usage warning | Notification at 80% of quota |

### 6.2 The binding constraint is the annual quota, not the rate limit

50 RPS is generous; 100,000 calls per year is not. That works out to **~274
calls per day** averaged over the term — and at the RPS ceiling the entire
annual quota is consumable in **33 minutes**. Any design discussion that starts
from the rate limit is looking at the wrong number.

Two access patterns, costed against a ~90-player, 6-team tournament:

| Pattern | Calls | Share of annual quota |
|---|---|---|
| Nightly batch: 90 players × 2 (bat+bowl) + ~19 leaderboard filters ≈ 200/night, over a 30-day tournament | **~6,000** | 6% |
| Live polling: 4 endpoints at 30s cadence = 480/hr; a 3.5h match ≈ 1,680; 30 matches | **~50,400** | 50% |

Batch refresh is affordable. Live polling is not, at per-client granularity.

### 6.3 Consequences for the design

1. **Caching is mandatory before any polling caller ships.** It is a cost
   control, not a latency optimisation. A live match screen must be served
   from one server-side poll shared by all viewers — never one upstream call
   per client. This does not change the scope of the current change (no caller
   exists yet), but it is now a **hard precondition** on the first one, not a
   "nice to have deferred until someone asks".
2. **Prefer batch over poll wherever the product allows.** Overnight or
   post-match refresh costs ~6% of the annual quota per tournament; the same
   data polled live costs an order of magnitude more.
3. **429 gets its own exception, and is not retried by default.** CricHeroes
   recommend exponential backoff but also charge every 429 against the quota
   (§13.4), so an automatic retry is a paid call. The cheaper fix is not to
   send above 50 RPS in the first place: any batch job must pace itself
   (§6.5). See §7.
4. **Instrument call volume from day one.** The 80% warning arrives from
   CricHeroes, which is late and out-of-band. A counter on our side — calls per
   day, per endpoint — is cheap now and expensive to retrofit after a bill.
   Done: §6.6. And the cache that point 1 requires: §6.7.

### 6.6 The call counter

Every request to CricHeroes is counted, per UTC day and endpoint, in
`cricheroes_call_counts` (`CricHeroesCallCount`): one `$inc` upsert per
request, keyed by a unique `(day, endpoint)` index.

| Counter | What it counts |
|---|---|
| `calls` | Every request that reached CricHeroes, or may have — what they charge for, 429s included (§13.4). Errs high |
| `throttled` | The 429s among them |
| `server_errors` | The 5xx among them; calls lost to their outages are not charged (§6.1), so these are the likeliest refund |
| `no_answer` | Among `calls`, those we stopped waiting for: timed out (ours or httpx's) or cancelled, as the player import cancels its other reads when one fails. CricHeroes may have answered and charged them all the same |
| `not_sent` | Requests whose connection failed, so they never left; not in `calls` |

The count errs high on purpose: a quota counter that reads low is the one that
lets the quota run out. A cancelled request is counted from a shielded write,
so a second cancellation cannot lose it.

**Where it hooks in.** The client tells a `recorder` of every attempt — each
retried 429 included, since each is charged — and `counted_client()`
(`app/services/cricheroes_usage.py`) builds a client with the recorder set.
The admin routes' client dependency, the player import and the scheduled sync
all build their clients through it. A failure to count is logged and never
fails the call it was counting. The client itself stays free of the database,
so scripts and tests can still use it bare; the credential check (§11) does,
and its one call is not counted.

**Reading it.** `GET /api/admin/cricheroes/usage?days=30` returns this quota
term's calls against `CRICHEROES_ANNUAL_QUOTA`, the share used, every one of
the last `days` days (empty ones included) and calls per endpoint over them.
The term renews yearly on the anniversary of `CRICHEROES_QUOTA_TERM_START`,
and the current one starts on the latest anniversary on or before today —
whatever year was configured, so a date still to come or a mistyped year
cannot hide this term's calls. Unset or blank, the last 365 days stand in for
it. Past
`CRICHEROES_USAGE_WARN_PERCENT` (50% by default, well before CricHeroes' 80%)
the response sets `over_warning`, and every scheduled sync logs a warning.

The quota is per CricHeroes account. The counter is per database, so it only
sees the whole account while one deployment holds the keys — walle-api today.

### 6.7 The cache

What visitors see comes from `cricheroes_snapshots` (`CricHeroesSnapshot`):
one document per resource and CricHeroes tournament, holding the last good
answer (stored under CricHeroes' field names, so it reads back through the
same models as a live call), when it was fetched, and the last refresh error
if there was one. `cricheroes_cache.read(resource, tournament_id)` is the read
side; nothing a visitor triggers calls CricHeroes.

**Cached, per tournament in `CRICHEROES_SYNC_TOURNAMENT_IDS`:** the match list,
the points table (exact duplicate rows dropped, §8.2), the MVP table, and the
batting and bowling leaderboards in their default order.

**Refreshed by results, not by the clock.** Each run (`sync_tournament`):
1. reads the match list — one call — and always stores it, so live scores are
   as fresh as the schedule;
2. digests the completed matches' results (id, result, winner, both scores;
   matches in play and upcoming ones are left out);
3. reads each other resource only if it is missing, was fetched under a
   different digest, is older than `CRICHEROES_SNAPSHOT_MAX_AGE_HOURS` (24), or
   the run is forced.

Comparing each resource's own digest, rather than "did results change this
run", means a resource whose read failed is retried on every run until it
catches up. A failed read keeps the last good data and records the error, so
an outage shows stale data rather than none. A missing credential stops the
run before any call.

**One run at a time, across processes.** The scheduled job and walle-api are
separate services, so an in-memory lock cannot keep an admin's "refresh now"
from overlapping the hourly run. Each run first claims the tournament with one
atomic write on its match-list document, which matches only when the
tournament was not refreshed in the last 5 minutes and no live claim is held;
when the document exists but does not match, the upsert's insert collides on
the unique key, and that collision is the refusal. The run is then reported as
skipped — "refreshed N minute(s) ago" or "another refresh of it is running" —
and makes no calls. A run releases its own claim when it ends, however it
ends; a claim left by a run that died expires after 10 minutes, longer than
any run (five requests of at most 15 s). Every other write is an upsert that
retries once if it loses the race to insert the document.

**Cost**, both tournaments, hourly: 2 × 24 match-list calls, plus 4 per
completed match per tournament, plus at most 8 a day for the age check — about
60 a day, a fifth of the ~274 the quota allows (§6.2). During play the
standings, MVP and leaderboards are a match behind; reading them every hour
during matches would cost four times as much.

**Running it.** `scripts/sync_cricheroes.py` is the scheduled job, meant for
its own Railway cron service (start command
`. /opt/venv/bin/activate && python scripts/sync_cricheroes.py`, schedule
`0 * * * *`, with `MONGODB_URL`, `MONGODB_DB_NAME`, `TENANCY`, the three
credentials and `CRICHEROES_SYNC_TOURNAMENT_IDS` set). It exits 0 when every
tournament refreshed or was current, 1 on any failure or missing credential,
and 0 with a message when nothing is configured. Admins can see the cache at
`GET /api/admin/cricheroes/cache` and refresh it with
`POST /api/admin/cricheroes/cache/refresh` (`tournament_id`, `force`), which
accepts only configured tournaments.

### 6.4 Timeout: deliberate deviation

Upstream allows 30s per request; we set **15s** (`CRICHEROES_TIMEOUT_SECONDS`).
Given their stated typical response of under 2s, a call still running at 15s is
not going to succeed usefully inside an admin request path. We would rather
return a 504 that says "upstream slow" than hold a worker for half a minute.
This is a deviation from the upstream allowance, not an oversight — raise the
env var if a specific endpoint proves legitimately slower.

It is a deadline for the whole request. httpx's own timeout applies to each
phase (connect, read, write) separately, so a response trickling in a byte at a
time would never trip it; the client wraps each request in `asyncio.wait_for`
as well.

### 6.5 Retry policy

Applies to **429 only**. Transport errors and 5xx are not retried: they are
surfaced immediately, because a retry loop over a dead upstream turns one slow
request into several.

- **Off by default** (`CRICHEROES_MAX_RETRIES=0`). CricHeroes confirmed that a
  429 counts against the quota just like a 200 (§13.4), so each retry is a
  paid call nobody asked for. A 429 goes straight back to the caller, with
  `Retry-After` when CricHeroes send one.
- When a caller opts in (`max_retries` > 0): exponential backoff with jitter
  (~0.5s, ~1.5s, …), capped so the total wait stays inside the 15s timeout.
- `Retry-After` (delta-seconds form) is honoured when present, in place of the
  backoff. If it asks for longer than the budget left, the client **gives up
  immediately** and passes the wait on to the caller, rather than sleep a
  shortened interval: coming back early would only earn a second 429 — and
  maybe a second charge. An HTTP-date `Retry-After` is ignored and the normal
  backoff applies.
- The CLI credential check (§11) runs with retries off, so one invocation is
  exactly one call.
- **Batch jobs must pace themselves below 50 RPS** rather than lean on
  retries. Admin traffic will never get near the limit; the only realistic
  source of a 429 is a job firing calls concurrently — e.g. a full-squad
  refresh with `asyncio.gather` over 180 calls. A semaphore or fixed rate in
  that job prevents the 429s, and with them the wasted charges. One process
  pacing itself is not a global limit, so run such a job in one place.

---

## 7. Error taxonomy

A single generic exception would make the most common failure — placeholder
credentials — indistinguishable from an unknown tournament id. Nine types, all
subclassing `CricHeroesError`:

| Exception | Trigger | Route status | Meaning |
|---|---|---|---|
| `CricHeroesConfigError` | credential missing, raised pre-flight | **503** | *We* are not configured |
| `CricHeroesAuthError` | HTTP 401; a 403 that is neither a firewall block nor 170001/170002; or `status: false` with code 2002 (or a message calling the api-key, secret or udid invalid), with any HTTP status but 429 | **502** | *Our* credentials were rejected |
| `CricHeroesBlockedError` | code 20250529, or a "blocked by security policy" message, with any HTTP status but 429 (seen with 403) | **502** | CricHeroes' Cloudflare firewall refused the request before their API saw it; the credentials were **not** checked |
| `CricHeroesAccessError` | code 170001, with any HTTP status (documented with 403) | **422** | The id is outside the tournaments CricHeroes serve us; our credentials work |
| `CricHeroesRateLimitError` | HTTP 429 (after any opted-in retries) | **429** | We went over 50 RPS — and were charged for it |
| `CricHeroesAPIError` | `status: false` with any other code: HTTP 200, or 403 + code 170002 | **404** | Upstream has no such tournament/match, or no such data for it |
| `CricHeroesTransportError` | timeout, DNS, connection reset | **504** | Never reached upstream |
| `CricHeroesHTTPError` | any other non-2xx, or non-JSON body | **502** | Upstream is unhealthy |
| `CricHeroesSchemaError` | HTTP 200, but `data` does not fit our model | **502** | Our model of the response is wrong |

`CricHeroesSchemaError` subclasses `CricHeroesHTTPError`, so it maps to 502 with
no extra route code; it exists so the message names the endpoint and the field
that did not fit. The models match the doc's examples (§8.0), but the live API
has not been called yet; if it disagrees with its own doc, this is the error
that says so, and it should be read as "fix the model", not "CricHeroes is
down".

Three mappings are deliberate and worth stating:

- **401/403 → 502, not 401.** It is our upstream credentials that failed, not
  the admin's session. Returning 401 would tell them to log in again, which
  cannot help. The detail string names the three env vars.
- **170001 → 422, not 502, and not 403.** CricHeroes serve us two tournaments
  (§13.12) and answer any other id — or a match from another tournament — with
  a 403 carrying code 170001. The credentials worked, so reporting it as
  rejected credentials would send someone to check keys that are fine. The
  admin can act on it, by using a served id, and the detail says so. Not 403:
  that is our own permission gate's answer, and the shared frontend API client
  (`src/lib/api/client.ts`) replaces every 403's detail with "you do not have
  permission" — the same trap as 401 above. A 422 keeps the detail.
  The code decides, not the status: one mapping (`api_error`) turns a
  `status: false` body into an exception whether it came with a 403 or a 200,
  so a 170001 on a 200 is still an access refusal. On a 403, only 170001 and
  170002 are read as being about the id, and 20250529 as the firewall; any
  other 403 is rejected credentials, and its detail repeats what CricHeroes
  said. Any other error status is read the same way before falling back to
  `CricHeroesHTTPError`; only a 429 is always the rate limit. Codes and
  messages are compared as text, whatever JSON type they arrive as.
  `CricHeroesAccessError` subclasses `CricHeroesAPIError`, so code that treats
  refusals alike still does.
- **`status: false` → 404.** CricHeroes report "no data for this id" with an
  error code, one per endpoint, mostly on an HTTP 200. That is a not-found, not
  a transport failure, and should not page anyone.

The documented codes (doc of 4 Nov 2026; the 96xxx codes of the 30 May 2025
doc are gone):

| Code | HTTP | Meaning |
|---|---|---|
| 170001 | 403 | Tournament not served to us ("Access to this tournament is not allowed.") |
| 170002 | 403 | Match not found |
| 170003 | 200 | Playing squad not found |
| 170004 / 170005 | 200 | Current partnership / partnership not found |
| 170006 / 170007 | 200 | Manhattan / worm graph data not found |
| 170008 | 200 | Tournament boundary count not found |
| 170009 / 170010 | 200 | Player match batting / bowling data not found |
| 170011 | 200 | Tournament match list not found |
| 170012 | 200 | Tournament point table not found |
| 170013 / 170014 | 200 | Batting / bowling leaderboard data not found (tournament and innings alike) |

No "not found" is documented for the stats filter, the season stats or the MVP
endpoints, and none for bad credentials or a 429.

Two undocumented codes, seen live on 6 Nov 2026 from requests with dummy
credentials:

| Code | HTTP | Meaning |
|---|---|---|
| 20250529 | 403 | "Request blocked by security policy." CricHeroes' Cloudflare firewall, answering httpx's default `User-Agent` (`python-httpx/…`) before any credential check. Every request our client sent got this, which the admin import reported as rejected credentials. |
| 2002 | 200 | "Invalid api-key". How a wrong key really comes back — not as a 401/403. The codes for a wrong secret or udid are unknown. |

The client now sends a `User-Agent` naming our app, which gets past the
firewall (§5.1). If the block comes back, the error says so rather than
blaming the credentials.
- **429 → 429, and yes, that contradicts the rule above.** Everywhere else an
  upstream problem is translated so the caller is not blamed for something
  they cannot fix. 429 is the exception because here the caller *can* act: the
  correct response really is to back off and retry, which is exactly what 429
  signals. It also stays distinguishable from the 503 that means "not
  configured". `Retry-After` is passed through when upstream supplies one.

  A 429 means the rate limit. CricHeroes' pricing answer has calls past the
  annual quota billed pay-as-you-go rather than refused, so running out of
  quota should not surface as a 429 (§13.4). The error detail says the request
  was still charged.

---

## 8. Response models

`app/schemas/cricheroes.py`, on a shared base:
`ConfigDict(populate_by_name=True, extra="allow", coerce_numbers_to_str=True)`.

**Lenient on purpose.** CricHeroes adds keys without notice. A strict model
turns an additive upstream change into a 500 on our side. Extras are *kept*, not
just tolerated, so they survive into our own responses instead of being silently
dropped — a new upstream field is visible to the frontend before we model it.
`coerce_numbers_to_str` keeps a field the doc shows as a string (`"92.2"`) a
string if a row arrives with a bare number, instead of failing the response.

### 8.0 Where the models come from

Every documented field of all 19 endpoints is modelled, from the example bodies
in the CricHeroes API doc (the MediaHubble build of 4 Nov 2026). Those bodies
are checked in, verbatim with long lists trimmed, as
`apps/backend/tests/fixtures/cricheroes_doc_examples.json`, so the models and
the evidence for them now live together. The fixture also keeps every
documented error body (`_errors`), and leaves the doc's request headers out.

A test parses each of the 19 examples through the real client method and walks
the result: any key that lands as an extra, at any depth, fails it, naming the
path. So "every documented field is modelled" is checked, not asserted, and a
field dropped from a model by mistake is caught. Another sends each documented
error body and checks the exception it becomes.

> **History.** The first implementation was built from the doc, then parked
> when this spec was requested; the parked code and the pasted doc were lost
> with the session container. A rebuild from this spec alone shipped with
> deliberately partial models, then the doc was re-supplied and the models
> completed. Checking the partial models against the doc found one wrong guess
> — `revised_target` / `revised_overs` are per *innings*, not per match — and
> three point-table columns (`Drawn`, `Tied`, `Quotient`) that the original
> alias table had missed. Keeping the doc's examples in the repository is so
> that this cannot happen again.
>
> **4 Nov 2026.** The MediaHubble doc replaced most examples (other matches and
> players) and added fields: `query_id` on most rows, `match_id` and
> `match_date_time` on the per-player match rows, `city_name` on the match list
> (for `city`; `is_watch_live` is gone), `TeamID` and `team_logo` on the point
> table, and the two MVP endpoints. The fixture was regenerated from it, and
> diffing it against the old one is how the changes were found. The new
> examples no longer show some traps of the old ones — an abandoned match, a
> no-result, a rain-revised chase, an unbroken stand's `"-"` — so those tests
> rebuild the old values on a current row rather than drop them.

**Typing policy.** Types follow the examples, including where they disagree
between endpoints (§8.2); values are passed on as sent, not normalised. Identity
fields (ids, names) are required; every statistic is optional, so a row with a
missing figure still parses. Flags stay the 0/1 integers CricHeroes sends, and
timestamps stay ISO-8601 strings.

### 8.1 Fields needing an alias

Many upstream keys are not valid Python identifiers. Each is declared with a
safe attribute name plus an `alias`:

| Upstream key | Attribute | Where |
|---|---|---|
| `4s`, `6s` | `fours`, `sixes` | batting leaderboards, batting season |
| `50s`, `100s` | `fifties`, `hundreds` | tournament batting leaderboard, batting season |
| `3_wickets` | `three_wickets` | bowling leaderboards (not bowling season) |
| `4_wickets`, `5_wickets` | `four_wickets`, `five_wickets` | bowling leaderboards, bowling season |
| `Team Name`, `Net RR`, `N/R`, `Last 5`, `TeamID` | `team_name`, `net_rr`, `no_result`, `last_5`, `team_id` | point table |
| `Group`, `Matches`, `Won`, `Lost`, `Drawn`, `Tied`, `Points`, `Quotient`, `GroupID`, `RoundID`, `RoundName` | lowercased / snake_case | point table |
| `SR`, `avg` | `strike_rate`, `average` | tournament bowling leaderboard |
| `bbf` | `best_bowling_figure` | innings bowling leaderboard |
| `mat`, `no`, `hs`, `bf`, `sr`, `avg` | `matches`, `not_outs`, `highest_score`, `balls_faced`, `strike_rate`, `average` | batting season |
| `mat`, `bbm`, `ave`, `econ`, `sr` | `matches`, `best_bowling`, `average`, `economy`, `strike_rate` | bowling season |

### 8.2 Type traps found in the documented payloads

These are the ones that would break a naively-typed model, or that a consumer
would reasonably get wrong. Each has a regression test using the doc's values.

| Field | Trap |
|---|---|
| `winning_team_id` (match list) | A **string**, not an int — `""` for an abandoned match, `"0"` for a no-result, `"362504"` otherwise |
| `revised_target` / `revised_overs` | On each **innings**, not the match. `0` means "not revised" |
| `to_over` (partnership) | Only on the per-team list, not the current partnership. A **string** — `"-"` while the stand is unbroken |
| `balls` | **`str`** on both leaderboards (`"554"`); in bowling season, **`int` on the `Career` row and `str` on season rows** |
| `overs` | **`str`** (`"92.2"`) on the tournament bowling leaderboard; **number** (`9.1`, `10`) on the innings leaderboard and in per-player data. Cricket notation either way: 9.1 is 9 overs and 1 ball |
| `economy` | **`str`** (`"5.45"`) on the tournament bowling leaderboard, **number** (`3.82`) on the innings one |
| `strike_rate` | **`str`** on the tournament batting (`"98.33"`) and bowling (`"20.52"`) leaderboards and in season stats; **float** on the innings batting leaderboard — with single-precision noise (`112.92500305175781`) |
| `average` | **`str`** for batting (`"81.00"`) and in season stats (`"-"` when none); **float** on the bowling leaderboard (`18.63`) |
| `highest_score` (`hs`, batting season) | A **string** (`"64"`) |
| `highest_run_with_not_out` | `"*"` or `""`, not a bool |
| `year` (season stats) | `"Career"` for the aggregate row, otherwise `"2023"` — not an int |
| Placeholders (bowling season) | `bbm` is `""` on one row and `"-"` on the next; `ave` is `"-"` on `Career` and `"0.00"` on the season |
| `match_result` | Free text, inconsistently cased: `"Resulted"`, `"Abandoned"`, `"abandoned"`. Use `winning_team_id`, not this, to classify results |
| `Last 5` (point table) | Holds every result so far (`"W-W-W-W-W-W-W-L"`), not five |
| `Net RR` (point table) | A string (`"-0.200"`), but a bare `0` for a team with no result yet; kept a string (`"0"`) |
| Point table rows | The doc of 4 Nov 2026 lists **every team twice**. The client drops exact repeats, so no consumer has to; rows that differ in any field (another round or group) are kept |
| `query_id` | Undocumented, on most rows. The same on every row of one response, so it names the query, not the row |
| MVP points | `batting`, `bowling`, `fielding`, `total` are **strings** with three decimals (`"8.719"`) |
| boundary count `data` | A one-element **list** wrapping a single object |

If CricHeroes sends a bare number where the doc shows a string, the base model's
`coerce_numbers_to_str` keeps the field a string instead of failing the response.

### 8.3 Serialisation

Routes set `response_model_by_alias=False`, so our JSON uses the clean attribute
names (`team_name`, `fours`) rather than the upstream aliases (`Team Name`,
`4s`) — the latter are awkward to consume from TypeScript. Unmodelled extras
still come through under their original upstream names.

---

## 9. Routes

`/api/admin/cricheroes`, tagged `Admin - CricHeroes`, with `get_platform_admin`
as a **router-level** dependency so no individual route can be added ungated by
mistake.

| Route | Query params |
|---|---|
| `GET /tournaments/{id}/matches` | `type`, `teamId`, `order` |
| `GET /tournaments/{id}/point-table` | `roundId`, `groupId` |
| `GET /tournaments/{id}/batting-leaderboard` | `sort_filter` |
| `GET /tournaments/{id}/inning-batting-leaderboard` | `sort_filter` |
| `GET /tournaments/{id}/bowling-leaderboard` | `sort_filter` |
| `GET /tournaments/{id}/inning-bowling-leaderboard` | `sort_filter` |
| `GET /tournaments/{id}/stats-filter` | — |
| `GET /tournaments/{id}/boundary-count` | — |
| `GET /tournaments/{id}/mvp` | — |
| `GET /usage` | `days` — the call counter (§6.6) |
| `GET /cache` | — the cache's contents and freshness (§6.7) |
| `POST /cache/refresh` | `tournament_id`, `force` — refresh now (§6.7) |

`{id}` is the **CricHeroes** tournament id, not our `Tournament` document id.
The two are unrelated today; §13.1 covers linking them. Only the two
tournaments CricHeroes serve us answer (§13.12); any other id gets a 422 that
says so (§7).

The client is supplied by a `yield` dependency, closed when the request ends —
which is also the seam tests override.

**Why admin-only.** Every call spends upstream quota against credentials we do
not control the rate limits of, and this data feeds tournament setup and imports
rather than public browsing. Public exposure would put our quota on the open
internet with no caching in front of it.

**Why platform admins, not tournament admins.** Since this spec was first
written, `main` split admin into platform admins (who run the registry) and
per-tournament admins, and every `/api/admin` route outside the registry is
guarded by `get_tournament_admin`. These routes are deliberately the exception:

- `{id}` is a CricHeroes id. Being admin of one of *our* tournaments says
  nothing about it — a tournament admin could query any CricHeroes tournament.
- The quota is one per account. A tournament admin's polling would spend every
  other tournament's budget.

`tests/test_tournament_admin.py` asserts every admin route has exactly one,
correct guard; `/api/admin/cricheroes` is listed there alongside the registry
as platform-admin territory. Once §13.1 links CricHeroes ids to our
`Tournament` documents, a tournament-scoped variant keyed on our own slug can be
opened to tournament admins.

### 9.1 Importing a tournament's players

`POST /tournaments/{id}/import-players?dry_run=true|false`, the router's one
write. `{id}` is the CricHeroes tournament; the players go into **our**
tournament named by the request's `X-Tournament-Slug` (`get_tenant`), i.e. the
admin page the button is pressed on. Platform admins only, like the rest of the
router. The admin panel shows it as **Import from CricHeroes** in the Import
Players dialog, to platform admins only; it takes the id or a CricHeroes
tournament link (`/tournament/<id>/...`), previews, then imports. Only the two
tournaments CricHeroes serve us can be imported from (§13.12); any other id is
refused with a 422 that says so, before anything is written.

**Where the players come from.** There is no roster endpoint and there will not
be one (§13.11), so the import reads two sources and merges them by player id.

1. **The registered teams, from the public Teams page** (added 6 Nov 2026,
   `app/services/cricheroes_teams_page.py`). `cricheroes.com/tournament/<id>/<slug>/teams`
   is server-rendered and carries every registered team with its players, under
   the same player ids the API uses, as a `teamResponse` object in the page's
   Next.js flight data (`self.__next_f.push` chunks). One plain GET, sent with
   our User-Agent; it spends nothing from the API allowance, and robots.txt
   allows tournament pages. CricHeroes' shared "Dummy" placeholder, one per
   team, is left out. For Tyrant Premier League Season 13 (2242502) it gave 12
   teams and 150 players ten days before the first match. This page is **not
   part of our API agreement** and its shape is theirs to change, so it fails
   loudly: an unreachable page is a 504, and a page that answers with anything
   but a readable team list (another status, no `teamResponse`, a team or
   player without the fields above) is a 502 that names the page. Either way
   the request fails before any API call is spent, and nothing is written — a
   roster of only those who have played would look complete and is not.
2. **The playing squads of played matches.** The import lists the tournament's matches, skips those not yet
played (`type` 2, or `status` "upcoming" in any case), and reads the playing
squad of each of the rest: five at a time, starts 50 ms apart (at most 20 calls
a second, under the 50 allowed), within a 120-second deadline for the whole
roster. These add anyone named in a squad without being registered,
substitutes included. A player in a squad is filed under the team of their
latest match, which wins over the team they are registered to.

A played match the squad endpoint answers with one of its two documented
"nothing here" codes — 170003 ("Match playing squad is not found!") or 170002
("Match is not found!", sent with a 403) — or with empty squads is counted and
passed over. Any other refusal, or any other failure, stops further calls and
fails the request, and nothing is written: a refusal such as 170001 is
CricHeroes turning us away, and must not quietly import a partial roster.
When a search finds nobody because every played match came back without a
squad, the panel says so, rather than that the tournament has not started.

| Cost | |
|---|---|
| Calls | 1 + played matches — ~31 for a 30-match tournament. The Teams page is not an API call and is not counted |
| Preview, then import within 10 minutes | the preview's calls only: the import reuses the roster the preview read (Teams page included), so it writes exactly what the admin saw. Kept in process memory — after 10 minutes, a restart, or on another replica, the import reads the squads itself |
| Reported | `cricheroes_calls`, `reused_preview`, `registered_players` and `registered_teams` in every response; audit log on a real import |

The match list is read as one page. No endpoint in the doc of 4 Nov 2026
paginates (§13.8).

**Before the first match the registered teams are the roster.** The API knows
nobody until a squad is named, but the Teams page lists everyone teams have
registered, so a pool needed before the tournament starts (an auction, say)
can come from this import. The sheet import is still the way to set prices,
slots and anything CricHeroes do not have. A tournament whose fixtures are not drawn up yet
answers the match list with 170011 ("Tournament match list is not found!");
when the Teams page found registered players that counts as no matches, and
the import goes ahead with them. Without registered players it is still the
404 it was.

**What it decides, per CricHeroes player** (`plan_import`, which writes
nothing):

| Action | When | Effect |
|---|---|---|
| `linked` | A player here already holds the id | nothing |
| `link` | Exactly one player here without an id has the same name **and the same team** (both ignoring case and spacing), and only one CricHeroes player has the name | that player's `cricheroes_player_id` is set — a targeted `$set` of it and `updated_at`, nothing else |
| `create` | Nobody here has the name, and only one CricHeroes player has it | a new player: name, team, id; price 0, no slot, no points, status Active |
| `skip` | The same name here on another team; several players here, or several on CricHeroes, share the name; the player here with that name is linked to a different CricHeroes player; or the name or team does not fit our limits | nothing; the reason is shown, and the id can be set by sheet import (§13.2) |

An existing player's price, slot, points, status, team and stats are never
changed. Linking needs the team to match because a common name on another side
is more likely a different person, and a wrong link credits one player with
another's stats; a team spelled differently here than on CricHeroes therefore
shows as a skip, fixed by a sheet import with the id. Two CricHeroes players
sharing a name are skipped rather than both created: names are unique within
a tournament — the manual form refuses a second, and the sheet import treats a
name as one player — so they are added by sheet import under distinct names.

**Concurrency and failure.** One import at a time per tournament: the plan is
made, and written, under a lock from the players there at that moment, so two
imports confirmed together cannot both create everyone. The lock is in process
memory, which covers the single replica `walle-api` runs; more replicas would
need the partial unique index on `(tournament_id, cricheroes_player_id)` from
§13.2. Writes are not transactional. If one fails part way, the audit log entry
is still written, marked `completed: false` with the counts that landed, and
running the import again finishes the job.

Photos are not copied: CricHeroes' image host is not among the image hosts
`next.config.js` allows, which `next/image` would refuse on the team pages, and
hotlinking their images is a question for CricHeroes first.

Running it again is safe: everyone it added or linked is `linked` the second
time. It is not a sync — players dropped from CricHeroes stay here.

**Not surfaced:** the 6 match-detail endpoints (match MVP included) and the 4
player-stats endpoints. Available on the client for server-side use; they get
routes when a screen needs them.

---

## 10. Testing

Seven files — the client, the routes, the player import (§9.1), the
credential check (§11), the call counter (§6.6), the cache (§6.7) and its
scheduled script — no network, `httpx.MockTransport` throughout. Response
bodies come from the API doc's examples
(`tests/fixtures/cricheroes_doc_examples.json`); hand-made bodies are used only
for what the doc does not show — errors, and drift from the documented types.
The backoff sleep is injectable so the retry tests assert on attempt counts
without actually waiting.

The anchor is a check run once per endpoint: the doc's example goes through the
real client method, the request path is asserted, and the parsed result must
contain no unmodelled key at any depth (§8.0). A companion test fails if an
example exists without a matching call, or the reverse.

**`test_cricheroes_client.py`** — headers and config (all five headers sent;
missing credentials raise pre-flight and name the missing vars; partial
credentials name only what is missing); error mapping (401 and 403 → auth error
with a message pointing at the env vars; 403 with 170001 → access error, with
170002 → API error; every documented error body → the right exception; 500 →
HTTP error, *not* auth;
`status: false` → API error carrying the upstream code; connection failure →
transport error; non-JSON body → HTTP error); retries (429 then 200 succeeds
without surfacing; 429 throughout raises the rate-limit error after exactly
`max_retries` attempts; `max_retries=0` raises on the first 429; a 500 is *not*
retried, nor is a transport error; `Retry-After` is honoured, a `Retry-After`
beyond the budget gives up without retrying, total waiting stays within the
budget, an HTTP-date `Retry-After` falls back to backoff); credentials never
appear in logs; URLs and params (optional params omitted when unset; upstream
param spellings; leaderboard paths; the separate partnership path); shapes
(boundary-count unwrapping; a list endpoint answering an object, and a field
that does not fit, both raise the schema error naming the endpoint); payload
parsing (each alias group above; each type trap above; unknown fields kept);
lifecycle (owned client closed, injected client not).

**`test_cricheroes_routes.py`** — runs against the real FastAPI app, with the
client dependency overridden by a *real* `CricHeroesClient` over a scripted
upstream, so each test exercises gate, route, client, model and serialisation
together. Covers the gate (401 signed out; 403 for a signed-in non-admin; **403
for a tournament admin**; 200 for a platform admin), each of the 9 routes,
query-param forwarding, alias-free serialisation, pass-through of unmodelled
fields, and every row of the error table in §7 including `Retry-After`
pass-through — and that, by default, a 429 reaches upstream exactly once.

**`test_cricheroes_player_import.py`** covers the import (§9.1), and
**`test_check_cricheroes_credentials.py`** what the check script may call
success (§11). The `status: false` response they all build comes from one
helper, `tests/cricheroes_responses.py`. The route and import files use the
existing `client` / `anon_client` fixtures from `tests/conftest.py` unchanged.

Mutation-checked: disabling retries, mistyping a trap field, gating on
tournament admin, and serialising by alias each turn the client and route tests
red. For the move to the doc of 4 Nov 2026: ignoring a 403's code, reading
170001 by status instead of code, dropping 170002 from the import's "no squad"
codes, restoring the old partnership path, and keeping duplicate point-table
rows each do too. For the counter and cache: not counting answered calls,
leaving the routes' client uncounted, re-reading a resource only when results
changed in the same run (so a failed read is never retried), letting matches
in play into the results digest, dropping the 5-minute guard, and storing
rows under our names instead of CricHeroes' each turn the tests red. So do,
after the review of #71: refreshing without the claim, never releasing it,
dropping the insert-race retry, sorting the digest as tuples, not counting a
cancelled request, counting a failed connection as sent, keeping a term start
still to come, and refusing a blank one.

---

## 11. Credential sanity check

`scripts/check_cricheroes_credentials.py` calls
`get-tournament-boundary-count` — the lightest endpoint upstream — and prints
which failure occurred: not configured, rejected, unreachable, or "credentials
OK but this tournament has no data". Exits 0/1 so it can be a deploy smoke check.

The doc does not say how CricHeroes reports bad credentials — possibly as an
HTTP 200 carrying `status: false` — so the only refusal the script counts as
success is code 170008 ("Tournament boundary count is not found!"), which
proves the request was looked up. Any other refusal exits 1. A 170001 (a
tournament not served to us) proves nothing either way, since the doc does not
say whether access is checked before or after the keys; the script says so and
names the served ids. It defaults to 2242502 (§13.12).

```bash
cd apps/backend
python scripts/check_cricheroes_credentials.py
python scripts/check_cricheroes_credentials.py --tournament-id <your-id>
```

It sets placeholder `SECRET_KEY` / `JWT_SECRET_KEY` before importing settings, so
a missing app secret cannot fail the script for a reason unrelated to CricHeroes.
It runs with retries off: one invocation is exactly one charged call. It does
not connect to the database, so that call is not in the counter (§6.6).

---

## 12. Rollout

| Phase | Work | Gate |
|---|---|---|
| 1 | Settings, `.env.example`, `httpx` reclassified | ✅ done |
| 2 | Schemas + exceptions + client + unit tests | ✅ done |
| 3 | Admin routes + route tests + wiring | ✅ done |
| 3b | Complete the models from the API doc (§8.0) | ✅ done — all 17 endpoints; 1,001 tests passing |
| 3b′ | Import a tournament's players from match squads, with an admin button (§9.1) | ✅ done |
| 3c | Tournament MVP and Match MVP endpoints (§13.5) | ✅ done — client methods, `PlayerMvp` model, doc examples, tests; the tournament table has a route |
| 3d | Move to the MediaHubble doc of 4 Nov 2026: paths, header, error codes, new fields (§13.12) | ✅ done |
| 4 | Obtain real credentials (the secret above all, §13.12), set in Railway, run the check script | script exits 0 |
| 5 | Call counter — calls/day/endpoint, logged and queryable (§6.6) | ✅ done |
| 5b | Cache with a results-driven scheduled sync (§6.7) | ✅ done; the Railway cron service is still to be created |
| 6 | Public pages read the cache: MVP, leaderboards, points table | separate change; reads `cricheroes_cache.read`, never CricHeroes |

Phases 1–3 are safe to merge with no credentials at all: nothing calls the API
until someone hits a route, and without credentials that route returns a 503
that says exactly what is missing.

Phase 5 is new and deliberately sits *before* the first real consumer. Once a
scheduled job or a live screen is running, quota is being spent at a rate nobody
is measuring, and CricHeroes' own warning only arrives at 80% of the annual
allowance — far too late to change a polling interval cheaply.

---

## 13. Open questions

1. **Linking CricHeroes ids to our tournaments.** Callers must supply a raw
   CricHeroes tournament id today. Adding `cricheroes_tournament_id` to the
   `Tournament` document would let routes key off our own slug instead. Worth
   doing — but it is a schema change and a separate PR. CricHeroes now serve us
   two tournaments only (§13.12), so for now the link is small.
2. **Player identity — decided: an explicit id, set at import.** `Player` has a
   `cricheroes_player_id`, filled from a "CricHeroes Player ID" column in the
   player import template (a `CricHeroes ID` header is accepted too). Name
   matching was ruled out: names are not unique and are spelled differently
   between systems. The import enforces the rules:
   - a positive whole number (`2826925`, Excel's `2826925.0` and CSV's
     `"2826925"` all accepted);
   - unique within a tournament — a second row with the same id, or an id
     another player in the tournament already holds, fails that row, and any
     row error stops the import; the same CricHeroes player may hold their id
     in several tournaments;
   - on update, a blank cell keeps the existing id, so re-importing an older
     sheet without the column unlinks nobody;
   - ids are judged against the tournament as it will be *after* the import,
     so two players can swap ids, or an id can move to another player, in one
     import — a holder whose own row gives them a new id frees theirs. All of
     a file's ids are checked in one query.

   Uniqueness is enforced by the importer, not a database index: no other
   write path sets the field yet. That leaves a window between validating and
   saving in which two simultaneous imports could both claim an id; a partial
   unique index on `(tournament_id, cricheroes_player_id)` belongs with the
   first other write path, such as the manual edit form. Admin player
   responses show it read-only; the manual create and edit forms do not take
   it yet, so a wrong id is fixed by re-importing the affected rows with
   `conflict=update`. CricHeroes offers no
   tournament roster endpoint; the CricHeroes import (§9.1) reads the
   registered teams off the public Teams page instead, so it can add and link
   the player pool before a tournament starts, and adds squad players as
   matches are played.
3. **Doc inconsistencies to confirm with CricHeroes.** In the doc of 4 Nov 2026:
   - **Which id is Tyrant Premier League Season 13?** The introduction says
     60214; every parameter description, and the stats filter's own sample,
     say 2242502. 60214 is the tournament the World Cup 2019 sample data came
     from, so 2242502 is probably right. The example URIs still use 60214,
     which the doc says answers 403.
   - The point-table example lists every team twice (§8.2).
   - The worm-graph example gives both teams the same id (362504).
   - The MVP sections say "Sample body to be added from a staging call", yet
     show one — World Cup 2019 data, unlike the stats filter's Tyrant Premier
     League sample — and the match MVP's example URI has no match id.

   **Resolved by the doc of 4 Nov 2026**, kept for the record — the doc of
   30 May 2025 had:
   - `MODB` ("Most Dot Balls") appears in the stats-filter response as a
     bowling-leaderboard filter, but is absent from that endpoint's documented
     filter list.
   - `MMOVB` is labelled "Most Maidens" in the stats-filter response but
     "maximum Overs in tournament" in the leaderboard endpoint's list.
   - `BB` and `MBBF` are both described as best bowling figures.
   - The match-list `type` parameter is documented with `Example: 2826556` (a
     player id) while the description says `1. live 2. upcoming 3. past`. The
     example response settles it: a past match has `"type": 3`.
   - `sort_filter` is documented as `number` on every leaderboard, but every
     value is a string code (`RUN`, `WICKET`).
   - The playing-squad example asks for `?teamId=362504` and returns *both*
     teams. Either the filter is ignored or the example was not regenerated.
   - Called for tournament 1493258 ("Client 2025"), the stats filter's `teams`
     list holds the six sides once each for 702687 (2023) and 1029866 (2024),
     and none for 2025 itself.
   - The boundary-count error example is not valid JSON (unquoted keys, single
     quotes). If the live API really answers like that, the client reports it
     as a 502 "non-JSON body" rather than a 404 "no data" — wrong, but loud.

   All of these are fixed: `MODB` is listed and `MMOVB` is "Most Maidens" in
   both places; `MBBF` is gone; the `type` example is `1`; `sort_filter` is a
   string; the squad example asks for one team and gets one; the stats filter
   lists one tournament's teams; the boundary-count error is valid JSON.
   Because `get-tournament-stat-leaderboard-filter` returns the filters a given
   tournament actually supports, prefer calling it over hardcoding the lists.
4. **Does a 429 consume quota? — Answered: yes.** CricHeroes: "Status code 429
   and 200 status code will be treated as part of the API requests." A
   throttled request is charged like a successful one, so automatic retries
   are now off by default (§6.5). Calls failing from *platform-side* outages
   are still not charged (§6.1).
   Not asked directly: how an exhausted annual quota presents. Their pricing
   answer bills calls past the quota pay-as-you-go rather than refusing them,
   so a 429 should only ever mean the rate limit.

5. **MVP / points endpoint — CricHeroes will build it.** Their answer: "Currently,
   the API does not cater this. We shall create the API and share the request
   and response for the same." No date in the written answer. It is not in the
   current doc (aglio build of 30 May 2025), and the stats-filter discovery
   endpoint lists no MVP group. When it arrives it needs, like the others: a
   client method, a model, its example added to the doc-examples fixture, and
   a route if a screen needs it. It decides whether we consume their points or
   compute our own:
   - If its formula is fixed, their MVP scoring is not necessarily our fantasy
     scoring — check before wiring it to `Player.points`.
   - **It is not built yet, so this is the moment to ask for its shape** — see
     §13.9.

   **Second round — the formula is theirs.** Asked whether the points formula
   is fixed or configurable per tournament, CricHeroes pointed to their MVP 2.0
   write-up (https://blog.cricheroes.com/mvp-2-0-pressure-index-impact-score/):
   points built from a pressure index and an impact score. Nothing in the
   answer offers per-tournament configuration, so treat it as fixed. The page
   could not be read from the build environment (its host is outside the
   session's network allowlist); read it before deciding whether MVP points can
   stand in for fantasy points, and in particular whether fielding is part of
   them (§13.6). Two endpoints are coming, Tournament MVP and Match MVP
   (§13.11), in "the standard response structure" — so expect the same
   `{status, data}` envelope, no extra fields on request.

   **Arrived — doc of 4 Nov 2026.** `get-match-player-mvp/{matchId}` and
   `get-tournament-player-mvp/{tournamentId}`: one row per player with
   `player_id`, team, `batting`, `bowling`, `fielding` and `total` points
   (strings, three decimals), `matches` and `rank`. The envelope adds a
   `help_link` to the same MVP 2.0 article; the client drops it with the rest
   of the envelope. Modelled as `PlayerMvp`; the tournament table has a route
   (`/mvp`), the match table is on the client only. The samples are marked
   provisional (§13.3). Fielding being its own figure answers half of §13.6.
   The formula itself is still only that article, still unreadable from here.

6. **Fielding data — points only.** The MVP rows (§13.5) break fielding
   out, but as points, not as catches, stumpings and run-outs. Fielding
   *points* now come from CricHeroes; fielding *events* still need a second
   source. Earlier: **no separate endpoint after all.** The second round of
   answers limits new work to the two MVP endpoints (§13.11), so there is no
   fielding endpoint. Whether catches, stumpings and run-outs reach us at all
   now depends on the MVP responses breaking fielding out; if they only fold it
   into a total, fielding needs a second source. The first answer, kept for the
   record — same as §13.5: not in the
   current API (confirmed against the full doc — catches, stumpings and
   run-outs appear on no endpoint), to be created with a request and response
   shared. Until it exists, any scoring formula with a fielding term still needs
   a second source (the Google Sheet, or manual admin entry).

7. **Bulk per-match endpoint — Answered: no, per player only** (twice: "We won't
   be able to support this change"). A full-squad
   refresh stays one call per player per discipline: ~180 calls for ~90 players.
   Affordable nightly (§6.2), not hourly, and it must be paced below 50 RPS
   (§6.5).

8. **Pagination — none.** The doc of 4 Nov 2026, the one CricHeroes say
   documents it, shows no page parameter on any endpoint and no page marker in
   any envelope. Read with their answer, nothing paginates. With two
   tournaments served, the largest response is one tournament's match list —
   or both, with `-1`. Earlier: **answered, but not by our copy of the doc.** Second round:
   "Pagination details are already mentioned in the respective API
   documentation and sample responses." Our copy — the aglio build of 30 May
   2025, whose examples are the test fixture — documents no page parameter on
   any of the 17 endpoints, and every example body is the bare
   `{status, data}` envelope with no next-page field. Either a newer doc
   exists or pagination lives somewhere we have not been shown; ask for the
   current doc and which fields to read. The client returns only `data`, so a
   page marker elsewhere in the envelope would be dropped today. First round,
   CricHeroes: "Some of the APIs where the
   data size is huge will have paginations in the API." That does not say which
   endpoints, what the parameters are called, or how a response signals that
   more pages exist, and the current doc shows pagination on none. The client
   reads one page per call, so an endpoint that starts paginating would return
   page one silently — a large tournament's match list is the likeliest. Ask
   for the specifics; until then, cross-check match-list counts against the
   point table's `Matches`.

9. **Per-match player rows can now be tied to a match.** Despite the answer
   below, the doc of 4 Nov 2026 adds `match_id` and `match_date_time` to every
   row of both per-player match-data endpoints. Fours, sixes and dot balls are
   still absent, and it is still one call per player (§13.7). The fields are
   modelled as optional until the live API is seen to send them. Earlier:
   **Answered: and they will not be.** Second round: "We won't be able to add additional fields or
   change the response structure for these APIs." So the two per-player
   match-data endpoints stay without `match_id`, date, fours, sixes and dot
   balls. They did ask which API we meant; the answer is
   `get-player-tournament-match-batting-data` and
   `get-player-tournament-match-bowling-data`, but with the scope closed
   (§13.11) expect no change. Per-match points now hinge on the Match MVP
   endpoint returning one row per player for the match. The original
   question: The two per-player
   match-data endpoints return one row per innings or spell, with runs, balls
   and strike rate (batting) or overs, maidens, runs and wickets (bowling) —
   and the opposition's *name*. No match id, no date. In the doc's own example
   Ben Stokes has two rows against Australia and two against New Zealand, which
   nothing but their order distinguishes. Batting rows also carry no fours or
   sixes, and bowling rows no dot balls. For per-match fantasy points that is
   the gap that matters most. Not yet asked. Since the MVP and fielding
   endpoints are still to be built (§13.5–13.6), ask that they carry `match_id`
   on every row and return a whole match or tournament per call rather than
   one player — and whether the existing per-match rows can gain `match_id`
   and boundaries too.

10. **Scorecards.** Nothing in the API returns a match scorecard: the match list
    has innings totals only, and per-player figures come one player at a time.
    Combined with §13.7 and §13.9, building per-match points for a full squad
    from this API costs one call per player per discipline, and still cannot
    say which match each row belongs to.


11. **The API scope is closed.** CricHeroes, second round: "Apart from the
    APIs already covered in the sample documentation, we are providing only
    these two new APIs" — Tournament MVP and Match MVP — "At this stage, we
    are not planning additional response changes or new fields beyond the
    agreed API scope." What that settles:
    - **No tournament roster endpoint.** Through the API, a tournament's
      players can only be collected from what has already been played: each
      match's playing squad, or the leaderboards (batters and bowlers only).
      The import therefore also reads the public Teams page (§9.1), which lists
      registered players before the first match — outside the API agreement,
      worth telling CricHeroes we do.
    - **No fielding endpoint** (§13.6), **no bulk player data** (§13.7), **no
      match ids on per-player rows** (§13.9).
    - Everything new must come through the two MVP endpoints. When their
      samples arrive, check: one row per player? `player_id` on every row?
      fielding broken out? paginated, and how? **Answered by the doc of
      4 Nov 2026:** yes, yes, as points (§13.6), and no.

12. **The MediaHubble doc (4 Nov 2026).** A rebuilt doc for our account. What
    changed, all handled in the client:
    - **Every path and the `device-type` header** — `/thirdparty/mediahubble/`
      and `thirdparty-media-hubble` (§5.1). The per-team partnership got its
      own path (§5.5).
    - **Two tournaments only:** 2242502 (Tyrant Premier League Season 13) and
      2251924 (its Test format), or `-1` for both. Any other tournament, or a
      match from one, answers 403 with code 170001; we answer 422 (§7).
    - **Every error code** — 96xxx became 1700xx, one "not found" per endpoint
      (§7). The player import's "no squad" is now 170003 or 170002 (§9.1).
    - **New fields** (§8.0) and the **two MVP endpoints** (§13.5).

    Still to ask CricHeroes:
    - Which id is Tyrant Premier League Season 13: 60214 or 2242502 (§13.3)?
    - Are the MVP samples final? They are marked "to be added from a staging
      call".
    - Are the `api-key` and `udid` in the doc's example requests the ones
      issued to us? The secret is shown only as `<SECRET_ACCESS_KEY>`, so it
      must come from CricHeroes separately — without it nothing can be called.
    - How do bad credentials and a 429 look? Neither is documented.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Placeholder credentials mistaken for real ones | Dedicated exception, error text naming the env vars, smoke script |
| A tournament outside our agreement mistaken for a credentials failure, or for a permissions problem | 170001 has its own exception, whatever status it comes with, and answers 422 saying so — not 502, and not the 403 our own gate uses (§7) |
| The doc changes without notice | The 4 Nov 2026 doc moved every path and changed the header and every error code unannounced. Regenerate the fixture from each new doc and let the diff and the tests show what changed (§8.0) |
| Upstream adds fields | `extra="allow"`; extras pass through rather than 500 |
| Upstream changes a field's type | Type traps documented in §8.2 and pinned by tests; `coerce_numbers_to_str` absorbs a number arriving where a string is documented; anything else surfaces as a 502 `CricHeroesSchemaError` naming the endpoint and field, not a 500 |
| Live API disagrees with its own doc | Models are built from the doc's examples, never called live yet. Statistics are optional, so only a wrong type or a missing id fails a response — with a schema error that says exactly what to fix |
| API doc lost again | Its example bodies are checked in as a test fixture (§8.0) |
| **Quota exhaustion** — 100k calls/year, no rollover, ~274/day averaged | Admin-only live routes; anything public reads the cache (§6.7), refreshed by results at ~60 calls a day; the call counter reports the term against the quota and warns at 50% (§6.6); CricHeroes warn at 80% |
| Unbudgeted overage spend | Overage bills at ₹0.50–0.75/call after a 10% grace band — a runaway poll loop is a cost incident, not just an outage. Own counter + alert well below the 80% upstream warning |
| Throttling under burst | A 429 is charged (§13.4), so it is not retried by default; batch jobs pace themselves below 50 RPS (§6.5). At our volumes a 429 more likely signals a runaway loop than real load |
| Response truncated at the 3 MB cap | No endpoint paginates (§13.8), and only two tournaments are served; if a match list looks short, verify its count against the point table |
| Upstream slow or down | 15s timeout → 504, distinct from a 502; deliberately below their 30s allowance (§6.4). Platform-side failures are not charged to quota |
| Secrets leaking to logs | Only URL and query params are logged; headers never are |
