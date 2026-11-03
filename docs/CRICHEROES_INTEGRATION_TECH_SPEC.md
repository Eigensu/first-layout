# CricHeroes Tournament API (v1) — Integration Plan & Tech Spec

**Status:** Phases 1–3 implemented (§12), all 17 endpoints fully modelled from
the API doc (§8). Not yet run against real credentials. CricHeroes will build an
MVP endpoint and a fielding endpoint and share their request and response
(§13.5–13.6).
**Owner:** Backend
**Scope:** `apps/backend`
**Upstream:** `https://cricheroes.in/api/v1`, "Client" resource group (17 GET endpoints)
**Sources:** the CricHeroes API doc (endpoints, payloads) and their written
answers on plan, quota, rate limits and SLA (§6), and on the follow-up
questions (§13.4–13.8).

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

- No persistence. Nothing is written to MongoDB; no new Beanie documents.
- No automatic mapping of CricHeroes players onto our `Player` collection.
  Admins link them explicitly through the player import (§13.2).
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
│   ├── schemas/cricheroes.py                 (new)  response models (§8)
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
| `cricheroes_max_retries` | `CRICHEROES_MAX_RETRIES` | `0` | no |

The timeout must be positive and the retry count non-negative; a bad value fails
at startup rather than at the first call.

`cricheroes_timeout_seconds` defaults **below** the 30s upstream allows — see
§6.4 for why. `cricheroes_max_retries` applies to 429 only (§6.5), and is `0` —
no retries — because CricHeroes confirmed a 429 is charged against the quota.

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
| `get_tournament_match_list(tournament_id, match_type=, team_id=, order=)` | `get-tournament-match-list/{id}` — `match_type` is sent as `type` |
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
3. **429 gets its own exception, and is not retried by default.** CricHeroes
   recommend exponential backoff but also charge every 429 against the quota
   (§13.4), so an automatic retry is a paid call. The cheaper fix is not to
   send above 50 RPS in the first place: any batch job must pace itself
   (§6.5). See §7.
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
credentials — indistinguishable from an unknown tournament id. Seven types, all
subclassing `CricHeroesError`:

| Exception | Trigger | Route status | Meaning |
|---|---|---|---|
| `CricHeroesConfigError` | credential missing, raised pre-flight | **503** | *We* are not configured |
| `CricHeroesAuthError` | HTTP 401 / 403 | **502** | *Our* credentials were rejected |
| `CricHeroesRateLimitError` | HTTP 429 (after any opted-in retries) | **429** | We went over 50 RPS — and were charged for it |
| `CricHeroesAPIError` | HTTP 200 + `status: false` | **404** | Upstream has no such tournament/match |
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

Every documented field of all 17 endpoints is modelled, from the example bodies
in the CricHeroes API doc. Those bodies are checked in, verbatim with long lists
trimmed, as `apps/backend/tests/fixtures/cricheroes_doc_examples.json`, so the
models and the evidence for them now live together.

A test parses each of the 17 examples through the real client method and walks
the result: any key that lands as an extra, at any depth, fails it, naming the
path. So "every documented field is modelled" is checked, not asserted, and a
field dropped from a model by mistake is caught.

> **History.** The first implementation was built from the doc, then parked
> when this spec was requested; the parked code and the pasted doc were lost
> with the session container. A rebuild from this spec alone shipped with
> deliberately partial models, then the doc was re-supplied and the models
> completed. Checking the partial models against the doc found one wrong guess
> — `revised_target` / `revised_overs` are per *innings*, not per match — and
> three point-table columns (`Drawn`, `Tied`, `Quotient`) that the original
> alias table had missed. Keeping the doc's examples in the repository is so
> that this cannot happen again.

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
| `Team Name`, `Net RR`, `N/R`, `Last 5` | `team_name`, `net_rr`, `no_result`, `last_5` | point table |
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
| `Last 5` (point table) | Holds every result so far (`"W-L-W-W-W-L-L-W-W"`), not five |
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

`{id}` is the **CricHeroes** tournament id, not our `Tournament` document id.
The two are unrelated today; §13.1 covers linking them.

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

**Not surfaced:** the 5 match-detail and 4 player-stats endpoints. Available on
the client for server-side use; they get routes when a screen needs them.

---

## 10. Testing

Two files, 104 tests, no network, `httpx.MockTransport` throughout. Response
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
with a message pointing at the env vars; 500 → HTTP error, *not* auth;
`status: false` → API error carrying the upstream code; connection failure →
transport error; non-JSON body → HTTP error); retries (429 then 200 succeeds
without surfacing; 429 throughout raises the rate-limit error after exactly
`max_retries` attempts; `max_retries=0` raises on the first 429; a 500 is *not*
retried, nor is a transport error; `Retry-After` is honoured, a `Retry-After`
beyond the budget gives up without retrying, total waiting stays within the
budget, an HTTP-date `Retry-After` falls back to backoff); credentials never
appear in logs; URLs and params (optional params omitted when unset; upstream
param spellings; leaderboard paths; the shared partnership path); shapes
(boundary-count unwrapping; a list endpoint answering an object, and a field
that does not fit, both raise the schema error naming the endpoint); payload
parsing (each alias group above; each type trap above; unknown fields kept);
lifecycle (owned client closed, injected client not).

**`test_cricheroes_routes.py`** — runs against the real FastAPI app, with the
client dependency overridden by a *real* `CricHeroesClient` over a scripted
upstream, so each test exercises gate, route, client, model and serialisation
together. Covers the gate (401 signed out; 403 for a signed-in non-admin; **403
for a tournament admin**; 200 for a platform admin), each of the 8 routes,
query-param forwarding, alias-free serialisation, pass-through of unmodelled
fields, and every row of the error table in §7 including `Retry-After`
pass-through — and that, by default, a 429 reaches upstream exactly once.

Both use the existing `client` / `anon_client` fixtures from `tests/conftest.py`
unchanged.

Both files were mutation-checked: disabling retries, mistyping a trap field,
gating on tournament admin, and serialising by alias each turn tests red.

---

## 11. Credential sanity check

`scripts/check_cricheroes_credentials.py` calls
`get-tournament-boundary-count` — the lightest endpoint upstream — and prints
which failure occurred: not configured, rejected, unreachable, or "credentials
OK but this tournament has no data". Exits 0/1 so it can be a deploy smoke check.

The doc does not say how CricHeroes reports bad credentials — possibly as an
HTTP 200 carrying `status: false` — so the only refusal the script counts as
success is code 96007 ("boundary count not found"), which proves the request
was looked up. Any other refusal exits 1.

```bash
cd apps/backend
python scripts/check_cricheroes_credentials.py
python scripts/check_cricheroes_credentials.py --tournament-id <your-id>
```

It sets placeholder `SECRET_KEY` / `JWT_SECRET_KEY` before importing settings, so
a missing app secret cannot fail the script for a reason unrelated to CricHeroes.
It runs with retries off: one invocation is exactly one charged call.

---

## 12. Rollout

| Phase | Work | Gate |
|---|---|---|
| 1 | Settings, `.env.example`, `httpx` reclassified | ✅ done |
| 2 | Schemas + exceptions + client + unit tests | ✅ done |
| 3 | Admin routes + route tests + wiring | ✅ done |
| 3b | Complete the models from the API doc (§8.0) | ✅ done — all 17 endpoints; 1,001 tests passing |
| 3c | MVP and fielding endpoints, once CricHeroes publish them (§13.5–13.6) | client method, model, doc example, tests for each |
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
   tournament roster endpoint, so the import remains the source of the player
   pool — the ids have to come from the organiser's sheet.
3. **Doc inconsistencies to confirm with CricHeroes.**
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

6. **Fielding data — CricHeroes will build it.** Same answer as §13.5: not in the
   current API (confirmed against the full doc — catches, stumpings and
   run-outs appear on no endpoint), to be created with a request and response
   shared. Until it exists, any scoring formula with a fielding term still needs
   a second source (the Google Sheet, or manual admin entry).

7. **Bulk per-match endpoint — Answered: no, per player only.** A full-squad
   refresh stays one call per player per discipline: ~180 calls for ~90 players.
   Affordable nightly (§6.2), not hourly, and it must be paced below 50 RPS
   (§6.5).

8. **Pagination — partly answered.** CricHeroes: "Some of the APIs where the
   data size is huge will have paginations in the API." That does not say which
   endpoints, what the parameters are called, or how a response signals that
   more pages exist, and the current doc shows pagination on none. The client
   reads one page per call, so an endpoint that starts paginating would return
   page one silently — a large tournament's match list is the likeliest. Ask
   for the specifics; until then, cross-check match-list counts against the
   point table's `Matches`.

9. **Per-match player rows cannot be tied to a match.** The two per-player
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

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Placeholder credentials mistaken for real ones | Dedicated exception, error text naming the env vars, smoke script |
| Upstream adds fields | `extra="allow"`; extras pass through rather than 500 |
| Upstream changes a field's type | Type traps documented in §8.2 and pinned by tests; `coerce_numbers_to_str` absorbs a number arriving where a string is documented; anything else surfaces as a 502 `CricHeroesSchemaError` naming the endpoint and field, not a 500 |
| Live API disagrees with its own doc | Models are built from the doc's examples, never called live yet. Statistics are optional, so only a wrong type or a missing id fails a response — with a schema error that says exactly what to fix |
| API doc lost again | Its example bodies are checked in as a test fixture (§8.0) |
| **Quota exhaustion** — 100k calls/year, no rollover, ~274/day averaged | Admin-only routes, no public exposure; caching is a precondition on the first polling caller (§6.3); batch over poll; call counter from day one; CricHeroes warns at 80% |
| Unbudgeted overage spend | Overage bills at ₹0.50–0.75/call after a 10% grace band — a runaway poll loop is a cost incident, not just an outage. Own counter + alert well below the 80% upstream warning |
| Throttling under burst | A 429 is charged (§13.4), so it is not retried by default; batch jobs pace themselves below 50 RPS (§6.5). At our volumes a 429 more likely signals a runaway loop than real load |
| Response truncated at the 3 MB cap | Pagination undocumented (§13.8); until answered, treat large match lists as suspect and verify counts against the point table |
| Upstream slow or down | 15s timeout → 504, distinct from a 502; deliberately below their 30s allowance (§6.4). Platform-side failures are not charged to quota |
| Secrets leaking to logs | Only URL and query params are logged; headers never are |
