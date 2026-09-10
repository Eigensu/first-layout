# CricHeroes Tournament API (v1) — Integration Plan & Tech Spec

**Status:** Proposed — awaiting approval before implementation
**Owner:** Backend
**Scope:** `apps/backend`
**Upstream:** `https://cricheroes.in/api/v1`, "Client" resource group (17 GET endpoints)
**Sources:** the CricHeroes API doc (endpoints, payloads) and their written
answers on plan, quota, rate limits and SLA (§6). Five questions remain
outstanding with CricHeroes — §13.4–13.8.

---

## 1. Summary

Add a typed, async server-side client for the CricHeroes third-party tournament
API, plus a small set of admin-gated FastAPI routes that expose the
tournament-level portion of it.

The client covers **all 17** documented endpoints so any of them can be called
from server code (imports, scheduled syncs, future screens). Only the
**tournament-level 8** get HTTP routes today — routes are cheap to add later,
and every route we publish is upstream quota exposed to a caller.

That last point is not rhetorical. The plan is 100,000 calls per **year**, and
the quota — not the rate limit — is what constrains this integration. §6 costs
it out.

### Decisions already taken

| Question | Decision |
|---|---|
| Which endpoints get routes | Tournament-level set (8), client covers all 17 |
| Response model fidelity | Full fidelity, lenient — model every documented field, allow unknown extras |
| Route access | Admin-only, via the existing `get_admin_user` dependency |
| Caching | Out of scope here (no caller yet), but a **hard precondition** on the first polling caller — §6.3 |
| 429 handling | Own exception, ≤2 retries with backoff, surfaced as 429 — §6.5, §7 |

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

- No persistence. Nothing is written to MongoDB; no new Beanie documents.
- No mapping of CricHeroes players onto our `Player` collection.
- No caching layer, no scheduled sync, no webhook ingestion. **Caching is
  deferred, not optional** — see §6.3; the first caller that polls has to bring
  one with it.
- No fantasy points computation. CricHeroes exposes no points or MVP endpoint
  (§13.5), and `Player.points` has no per-tournament dimension today.
- No frontend work.
- No public (unauthenticated) exposure of any CricHeroes data.

---

## 3. Architecture

```
apps/backend/
├── config/settings.py                        (modified)  CRICHEROES_* settings
├── app/
│   ├── schemas/cricheroes.py                 (new)  ~30 response models
│   ├── services/
│   │   ├── cricheroes_client.py              (new)  CricHeroesClient, 17 methods
│   │   └── cricheroes_errors.py              (new)  exception taxonomy
│   └── routes/admin/cricheroes.py            (new)  8 admin routes
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
| `cricheroes_max_retries` | `CRICHEROES_MAX_RETRIES` | `2` | no |

Plus a `cricheroes_is_configured` property (all three credentials present).

`cricheroes_timeout_seconds` defaults **below** the 30s upstream allows — see
§6.4 for why. `cricheroes_max_retries` applies to 429 only (§6.5); set it to `0`
to disable retrying entirely if a 429 turns out to consume quota.

The three credentials are **optional at import time** and validated **at call
time**. Making them required would break every existing deployment, every test
run, and every unrelated script the moment this merges — `Settings()` is
instantiated at import in `config/settings.py`.

`.env.example` gains a documented block. Real values go in the monorepo-root
`.env` and in the Railway environment.

> ⚠️ **The credentials printed in the CricHeroes API doc are examples.**
> `api-key: 1`, `secret_access_key: "o5LgzLbpIb-…"`, `udid: "8817480565574762"`.
> They will be rejected. This is the single most likely cause of a failed first
> call, and the error messages are written to say so explicitly.

**Dependency change:** `httpx==0.27.2` moves from the dev block of
`requirements.txt` to the runtime block. It is already pinned and already
installed — this only reclassifies it, since `app/services/auth/twofactor.py`
already imports it at runtime today.

---

## 5. Client design

### 5.1 Request headers

Every request carries the five documented headers. `device-type` is a constant
(`thirdparty-client`) — the "Client" resource group is only reachable as a
third-party client.

```
Content-Type: application/json
api-key: <CRICHEROES_API_KEY>
secret_access_key: <CRICHEROES_SECRET_ACCESS_KEY>
udid: <CRICHEROES_UDID>
device-type: thirdparty-client
```

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

### 5.5 Method inventory (17)

**Match (5)**

| Method | Upstream path |
|---|---|
| `get_match_playing_squad(match_id, team_id=None)` | `get-match-playing-squad/{matchId}` |
| `get_match_current_partnership(match_id)` | `get-match-current-partnership/{matchId}` |
| `get_match_partnership(match_id, team_id)` | `get-match-current-partnership/{matchId}/{teamId}` |
| `get_match_manhattan_graph(match_id)` | `get-match-manhattan-graph/{matchId}` |
| `get_match_worm_graph(match_id)` | `get-match-worm-graph/{matchId}` |

> Note the first two partnership endpoints share a path. "Get Match
> Partnership" is distinguished from "Get Match Current Partnership" only by the
> trailing `teamId` segment, and returns a *list* where the other returns a
> single object. This is easy to mis-wire; it gets a dedicated test.

**Tournament (5)**

| Method | Upstream path |
|---|---|
| `get_tournament_boundary_count(tournament_id)` | `get-tournament-boundary-count/{id}` |
| `get_player_tournament_match_batting_data(tournament_id, player_id)` | `get-player-tournament-match-batting-data/{tid}/{pid}` |
| `get_player_tournament_match_bowling_data(tournament_id, player_id)` | `get-player-tournament-match-bowling-data/{tid}/{pid}` |
| `get_tournament_match_list(tournament_id, type=, team_id=, order=)` | `get-tournament-match-list/{id}` |
| `get_tournament_point_table(tournament_id, round_id=, group_id=)` | `get-tournament-point-table/{id}` |

**Leaderboards (5)**

| Method | `sort_filter` values |
|---|---|
| `get_tournament_batting_leaderboard` | RUN, HS, HSR, HAVG, MSIX, MFOUR, MFIFTY, MCENTURY |
| `get_tournament_inning_batting_leaderboard` | MIHS, MISIX, MIFOUR, MIHSR |
| `get_tournament_bowling_leaderboard` | WICKET, BB, MBSR, MBAVG, MBECO, MMOVB, MBBF |
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
3. **429 gets its own exception and a bounded retry.** CricHeroes explicitly
   expects exponential backoff. See §7.
4. **Instrument call volume from day one.** The 80% warning arrives from
   CricHeroes, which is late and out-of-band. A counter on our side — calls per
   day, per endpoint — is cheap now and expensive to retrofit after a bill.

### 6.4 Timeout: deliberate deviation

Upstream allows 30s per request; we set **15s** (`CRICHEROES_TIMEOUT_SECONDS`).
Given their stated typical response of under 2s, a call still running at 15s is
not going to succeed usefully inside an admin request path. We would rather
return a 504 that says "upstream slow" than hold a worker for half a minute.
This is a deviation from the upstream allowance, not an oversight — raise the
env var if a specific endpoint proves legitimately slower.

### 6.5 Retry policy

Applies to **429 only**. Transport errors and 5xx are not retried: they are
surfaced immediately, because a retry loop over a dead upstream turns one slow
request into several.

- Max **2** retries, exponential backoff with jitter (~0.5s, ~1.5s), capped so
  worst-case added latency stays well inside the 15s timeout.
- `Retry-After` is honoured when present, up to the timeout budget.
- Retries are deliberately few: it is **unconfirmed whether a 429 response
  counts against the quota** (§13.4). Until CricHeroes confirms it does not,
  every retry is assumed to cost money.

---

## 7. Error taxonomy

A single generic exception would make the most common failure — placeholder
credentials — indistinguishable from an unknown tournament id. Six types, all
subclassing `CricHeroesError`:

| Exception | Trigger | Route status | Meaning |
|---|---|---|---|
| `CricHeroesConfigError` | credential missing, raised pre-flight | **503** | *We* are not configured |
| `CricHeroesAuthError` | HTTP 401 / 403 | **502** | *Our* credentials were rejected |
| `CricHeroesRateLimitError` | HTTP 429, after retries exhausted | **429** | We are over 50 RPS, or out of quota |
| `CricHeroesAPIError` | HTTP 200 + `status: false` | **404** | Upstream has no such tournament/match |
| `CricHeroesTransportError` | timeout, DNS, connection reset | **504** | Never reached upstream |
| `CricHeroesHTTPError` | any other non-2xx, or non-JSON body | **502** | Upstream is unhealthy |

Three mappings are deliberate and worth stating:

- **401/403 → 502, not 401.** It is our upstream credentials that failed, not
  the admin's session. Returning 401 would tell them to log in again, which
  cannot help. The detail string names the three env vars and says the doc's
  values are examples.
- **`status: false` → 404.** CricHeroes reports "no data for this id" as an
  HTTP 200 carrying an error code (96001, 96003, 96007, 96010, …). That is a
  not-found, not a transport failure, and should not page anyone.
- **429 → 429, and yes, that contradicts the rule above.** Everywhere else an
  upstream problem is translated so the caller is not blamed for something
  they cannot fix. 429 is the exception because here the caller *can* act: the
  correct response really is to back off and retry, which is exactly what 429
  signals. It also stays distinguishable from the 503 that means "not
  configured". `Retry-After` is passed through when upstream supplies one.

  Note that 429 covers two very different conditions — a burst over 50 RPS
  (transient, retry works) and an exhausted annual quota (retrying will never
  work). We do not yet know how CricHeroes distinguishes them on the wire; see
  §13.4. Until we do, the error detail says both are possible.

---

## 8. Response models

`app/schemas/cricheroes.py`, ~30 models on a shared base:
`model_config = ConfigDict(populate_by_name=True, extra="allow")`.

**Lenient on purpose.** CricHeroes adds keys without notice. A strict model
turns an additive upstream change into a 500 on our side. Extras are *kept*, not
just tolerated, so they survive into our own responses instead of being silently
dropped — a new upstream field is visible to the frontend before we model it.

### 8.1 Fields needing an alias

Many upstream keys are not valid Python identifiers. Each is declared with a
safe attribute name plus an `alias`:

| Upstream key | Attribute | Where |
|---|---|---|
| `4s`, `6s`, `50s`, `100s` | `fours`, `sixes`, `fifties`, `hundreds` | batting leaderboards, season stats |
| `3_wickets`, `4_wickets`, `5_wickets` | `three_wickets`, `four_wickets`, `five_wickets` | bowling leaderboards, season stats |
| `Team Name`, `Net RR`, `N/R`, `Last 5` | `team_name`, `net_rr`, `no_result`, `last_5` | point table |
| `Group`, `Matches`, `Won`, `Lost`, `Points`, `GroupID`, `RoundID`, `RoundName` | lowercased | point table |
| `SR`, `avg` | `strike_rate`, `average` | bowling leaderboard |
| `mat`, `no`, `hs`, `bf`, `sr`, `avg` | `matches`, `not_outs`, `highest_score`, `balls_faced`, `strike_rate`, `average` | batting season |
| `bbm`, `ave`, `econ` | `best_bowling`, `average`, `economy` | bowling season |

### 8.2 Type traps found in the documented payloads

These are the ones that would break a naively-typed model. Each gets a
regression test built from the doc's own example body.

| Field | Trap |
|---|---|
| `winning_team_id` (match list) | A **string**, not an int — `""` for an abandoned match, `"0"` for a no-result, `"362504"` otherwise |
| `to_over` (partnership) | A **string** — `"-"` while the stand is unfinished |
| `balls` (bowling season) | **`int` on the `Career` row, `str` on season rows** — must accept both |
| `strike_rate` | **`str`** (`"98.33"`) on the tournament batting leaderboard, **`float`** (`112.925`) on the inning batting leaderboard |
| `overs` | `float` (`2.5`) in per-player data, `str` (`"92.2"`) in the bowling leaderboard |
| `average` / `avg` | `str` (`"81.00"`) for batting, `float` (`18.63`) for bowling |
| `highest_run_with_not_out` | `"*"` or `""`, not a bool |
| `year` (season stats) | `"Career"` for the aggregate row, otherwise `"2023"` — not an int |
| boundary count `data` | A one-element **list** wrapping a single object |
| `revised_target` / `revised_overs` | `0` means "not revised", not "target zero" |

### 8.3 Serialisation

Routes set `response_model_by_alias=False`, so our JSON uses the clean attribute
names (`team_name`, `fours`) rather than the upstream aliases (`Team Name`,
`4s`) — the latter are awkward to consume from TypeScript. Unmodelled extras
still come through under their original upstream names.

---

## 9. Routes

`/api/admin/cricheroes`, tagged `Admin - CricHeroes`, with `get_admin_user` as a
**router-level** dependency so no individual route can be added ungated by
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

`{id}` is the **CricHeroes** tournament id, not our `Tournament` document id.
The two are unrelated today; §13.1 covers linking them.

The client is supplied by a `yield` dependency, closed when the request ends —
which is also the seam tests override.

**Why admin-only.** Every call spends upstream quota against credentials we do
not control the rate limits of, and this data feeds tournament setup and imports
rather than public browsing. Public exposure would put our quota on the open
internet with no caching in front of it.

**Not surfaced:** the 5 match-detail and 4 player-stats endpoints. Available on
the client for server-side use; they get routes when a screen needs them.

---

## 10. Testing

Two files, no network, `httpx.MockTransport` throughout. Every fixture body is a
trimmed copy of an example from the API doc. The backoff sleep is injectable so
the retry tests assert on attempt counts without actually waiting.

**`test_cricheroes_client.py`** — headers and config (all five headers sent;
missing credentials raise pre-flight and name the missing vars; partial
credentials name only what is missing); error mapping (401 and 403 → auth error
with a message pointing at the env vars; 500 → HTTP error, *not* auth;
`status: false` → API error carrying the upstream code; connection failure →
transport error; non-JSON body → HTTP error); retries (429 then 200 succeeds
without surfacing; 429 throughout raises the rate-limit error after exactly
`max_retries` attempts; `max_retries=0` raises on the first 429; a 500 is *not*
retried; `Retry-After` is honoured but clamped to the timeout budget); URLs and
params (optional params
omitted when unset; upstream param spellings; the shared partnership path);
payload parsing (each alias group above; each type trap above; unknown fields
kept); lifecycle (owned client closed, injected client not).

**`test_cricheroes_routes.py`** — runs against the real FastAPI app with the
client dependency overridden. Covers the admin gate (401 unauthenticated), each
of the 8 routes, query-param forwarding, alias-free serialisation, and every row
of the error table in §7.

Both use the existing `client` / `anon_client` fixtures from `tests/conftest.py`
unchanged.

---

## 11. Credential sanity check

`scripts/check_cricheroes_credentials.py` calls
`get-tournament-boundary-count` — the lightest endpoint upstream — and prints
which failure occurred: not configured, rejected, unreachable, or "credentials
OK but this tournament has no data". Exits 0/1 so it can be a deploy smoke check.

```bash
cd apps/backend
python scripts/check_cricheroes_credentials.py
python scripts/check_cricheroes_credentials.py --tournament-id <your-id>
```

It sets placeholder `SECRET_KEY` / `JWT_SECRET_KEY` before importing settings, so
a missing app secret cannot fail the script for a reason unrelated to CricHeroes.

---

## 12. Rollout

| Phase | Work | Gate |
|---|---|---|
| 1 | Settings, `.env.example`, `httpx` reclassified | merged, no behaviour change |
| 2 | Schemas + exceptions + client + unit tests | green suite, still no routes |
| 3 | Admin routes + route tests + wiring | green suite |
| 4 | Obtain real credentials, set in Railway, run the check script | script exits 0 |
| 5 | Call counter — calls/day/endpoint, logged and queryable | in place *before* any scheduled or polling caller |
| 6 | Frontend consumes the routes | separate change, ships with a cache (§6.3) |

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
   doing — but it is a schema change and a separate PR.
2. **Player identity.** CricHeroes `player_id` has no relationship to our
   `Player` documents. Anything that imports stats needs a mapping strategy
   (explicit id column on import? name matching? both?). Out of scope here, and
   the hard part of any future sync.
3. **Doc inconsistencies to confirm with CricHeroes.**
   - `MODB` ("Most Dot Balls") appears in the stats-filter response as a
     bowling-leaderboard filter, but is absent from that endpoint's documented
     filter list.
   - `MMOVB` is labelled "Most Maidens" in the stats-filter response but
     "maximum Overs in tournament" in the leaderboard endpoint's list.
   - `BB` and `MBBF` are both described as best bowling figures.
   - The match-list `type` parameter is documented with `Example: 2826556` (a
     player id) while the description says `1. live 2. upcoming 3. past`.
   Because `get-tournament-stat-leaderboard-filter` returns the filters a given
   tournament actually supports, prefer calling it over hardcoding the lists.
4. **Does a 429 consume quota?** Unanswered. CricHeroes confirmed that calls
   failing due to *platform-side outages* are not charged, but said nothing
   about throttled requests. This sets our retry budget (§6.5) — if a 429 is
   free, we can retry more aggressively than the current 2.
   Related and also open: how an exhausted annual quota presents on the wire.
   If it is also a 429, we cannot tell "slow down" from "you are out of calls"
   without asking.

5. **No MVP / points endpoint exists in this API.** Confirmed, not assumed:
   `get-tournament-stat-leaderboard-filter` is CricHeroes' own discovery
   endpoint for what a tournament supports, and it returns only `season`,
   `batting`, `bowling` and `teams` groups. No MVP entry, no fielding group.
   The CricHeroes app *does* show an MVP tab on tournament leaderboards, so an
   endpoint may exist outside the `thirdparty/client` group — **asked, awaiting
   answer**. This matters because it decides whether we consume their points or
   compute our own:
   - If it exists, we also need to know whether the points formula is fixed or
     configurable per tournament, since their MVP scoring is not necessarily
     our fantasy scoring.
   - If it does not, we compute points from batting + bowling stats, and the
     fielding component has no source (see below).

6. **No fielding data anywhere in the documented API.** Catches, stumpings and
   run-outs appear on no endpoint; the per-player tournament endpoints cover
   batting and bowling only. Any scoring formula with a fielding term needs a
   second source (the existing Google Sheet, or manual admin entry). Product
   decision, not a technical one. **Asked, awaiting answer.**

7. **No bulk per-match endpoint.** `get-player-tournament-match-batting-data`
   is scoped to one player, so a full-squad refresh is one call per player per
   discipline. At ~90 players that is 180 calls per refresh — affordable
   nightly (§6.2), not affordable hourly. Asked whether a bulk variant exists.

8. **Pagination is undocumented but declared mandatory.** CricHeroes' ops
   answer states that "pagination and filtering parameters are mandatory" for
   datasets approaching the 3 MB payload cap, yet no tournament endpoint in the
   API doc documents a pagination parameter. Asked which endpoints support it
   and what the parameter names are. Until answered, a large tournament's match
   list is an unquantified truncation risk.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Placeholder credentials mistaken for real ones | Dedicated exception, error text naming the env vars, smoke script |
| Upstream adds fields | `extra="allow"`; extras pass through rather than 500 |
| Upstream changes a field's type | Type traps documented in §8.2 and pinned by tests; a mismatch surfaces as a 404 with the validation error, not a 500 |
| **Quota exhaustion** — 100k calls/year, no rollover, ~274/day averaged | Admin-only routes, no public exposure; caching is a precondition on the first polling caller (§6.3); batch over poll; call counter from day one; CricHeroes warns at 80% |
| Unbudgeted overage spend | Overage bills at ₹0.50–0.75/call after a 10% grace band — a runaway poll loop is a cost incident, not just an outage. Own counter + alert well below the 80% upstream warning |
| Throttling under burst | ≤2 retries with backoff on 429 (§6.5); 50 RPS is generous, so a 429 more likely signals a bug in our call pattern than legitimate load |
| Response truncated at the 3 MB cap | Pagination undocumented (§13.8); until answered, treat large match lists as suspect and verify counts against the point table |
| Upstream slow or down | 15s timeout → 504, distinct from a 502; deliberately below their 30s allowance (§6.4). Platform-side failures are not charged to quota |
| Secrets leaking to logs | Only URL and query params are logged; headers never are |
