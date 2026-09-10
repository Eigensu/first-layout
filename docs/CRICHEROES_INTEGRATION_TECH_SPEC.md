# CricHeroes Tournament API (v1) — Integration Plan & Tech Spec

**Status:** Proposed — awaiting approval before implementation
**Owner:** Backend
**Scope:** `apps/backend`
**Upstream:** `https://cricheroes.in/api/v1`, "Client" resource group (17 GET endpoints)

---

## 1. Summary

Add a typed, async server-side client for the CricHeroes third-party tournament
API, plus a small set of admin-gated FastAPI routes that expose the
tournament-level portion of it.

The client covers **all 17** documented endpoints so any of them can be called
from server code (imports, scheduled syncs, future screens). Only the
**tournament-level 8** get HTTP routes today — routes are cheap to add later,
and every route we publish is upstream quota exposed to a caller.

### Decisions already taken

| Question | Decision |
|---|---|
| Which endpoints get routes | Tournament-level set (8), client covers all 17 |
| Response model fidelity | Full fidelity, lenient — model every documented field, allow unknown extras |
| Route access | Admin-only, via the existing `get_admin_user` dependency |

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
- No caching layer, no scheduled sync, no webhook ingestion.
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

Plus a `cricheroes_is_configured` property (all three credentials present).

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

## 6. Error taxonomy

A single generic exception would make the most common failure — placeholder
credentials — indistinguishable from an unknown tournament id. Five types, all
subclassing `CricHeroesError`:

| Exception | Trigger | Route status | Meaning |
|---|---|---|---|
| `CricHeroesConfigError` | credential missing, raised pre-flight | **503** | *We* are not configured |
| `CricHeroesAuthError` | HTTP 401 / 403 | **502** | *Our* credentials were rejected |
| `CricHeroesAPIError` | HTTP 200 + `status: false` | **404** | Upstream has no such tournament/match |
| `CricHeroesTransportError` | timeout, DNS, connection reset | **504** | Never reached upstream |
| `CricHeroesHTTPError` | any other non-2xx, or non-JSON body | **502** | Upstream is unhealthy |

Two mappings are deliberate and worth stating:

- **401/403 → 502, not 401.** It is our upstream credentials that failed, not
  the admin's session. Returning 401 would tell them to log in again, which
  cannot help. The detail string names the three env vars and says the doc's
  values are examples.
- **`status: false` → 404.** CricHeroes reports "no data for this id" as an
  HTTP 200 carrying an error code (96001, 96003, 96007, 96010, …). That is a
  not-found, not a transport failure, and should not page anyone.

---

## 7. Response models

`app/schemas/cricheroes.py`, ~30 models on a shared base:
`model_config = ConfigDict(populate_by_name=True, extra="allow")`.

**Lenient on purpose.** CricHeroes adds keys without notice. A strict model
turns an additive upstream change into a 500 on our side. Extras are *kept*, not
just tolerated, so they survive into our own responses instead of being silently
dropped — a new upstream field is visible to the frontend before we model it.

### 7.1 Fields needing an alias

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

### 7.2 Type traps found in the documented payloads

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

### 7.3 Serialisation

Routes set `response_model_by_alias=False`, so our JSON uses the clean attribute
names (`team_name`, `fours`) rather than the upstream aliases (`Team Name`,
`4s`) — the latter are awkward to consume from TypeScript. Unmodelled extras
still come through under their original upstream names.

---

## 8. Routes

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
The two are unrelated today; §11 covers linking them.

The client is supplied by a `yield` dependency, closed when the request ends —
which is also the seam tests override.

**Why admin-only.** Every call spends upstream quota against credentials we do
not control the rate limits of, and this data feeds tournament setup and imports
rather than public browsing. Public exposure would put our quota on the open
internet with no caching in front of it.

**Not surfaced:** the 5 match-detail and 4 player-stats endpoints. Available on
the client for server-side use; they get routes when a screen needs them.

---

## 9. Testing

Two files, no network, `httpx.MockTransport` throughout. Every fixture body is a
trimmed copy of an example from the API doc.

**`test_cricheroes_client.py`** — headers and config (all five headers sent;
missing credentials raise pre-flight and name the missing vars; partial
credentials name only what is missing); error mapping (401 and 403 → auth error
with a message pointing at the env vars; 500 → HTTP error, *not* auth;
`status: false` → API error carrying the upstream code; connection failure →
transport error; non-JSON body → HTTP error); URLs and params (optional params
omitted when unset; upstream param spellings; the shared partnership path);
payload parsing (each alias group above; each type trap above; unknown fields
kept); lifecycle (owned client closed, injected client not).

**`test_cricheroes_routes.py`** — runs against the real FastAPI app with the
client dependency overridden. Covers the admin gate (401 unauthenticated), each
of the 8 routes, query-param forwarding, alias-free serialisation, and every row
of the error table in §6.

Both use the existing `client` / `anon_client` fixtures from `tests/conftest.py`
unchanged.

---

## 10. Credential sanity check

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

## 11. Rollout

| Phase | Work | Gate |
|---|---|---|
| 1 | Settings, `.env.example`, `httpx` reclassified | merged, no behaviour change |
| 2 | Schemas + exceptions + client + unit tests | green suite, still no routes |
| 3 | Admin routes + route tests + wiring | green suite |
| 4 | Obtain real credentials, set in Railway, run the check script | script exits 0 |
| 5 | Frontend consumes the routes | separate change |

Phases 1–3 are safe to merge with no credentials at all: nothing calls the API
until someone hits a route, and without credentials that route returns a 503
that says exactly what is missing.

---

## 12. Open questions

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
4. **Caching / rate limits.** No published limit. If a screen polls a
   leaderboard, we will want a short-TTL cache in front of it. Deferred until
   there is a caller.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| Placeholder credentials mistaken for real ones | Dedicated exception, error text naming the env vars, smoke script |
| Upstream adds fields | `extra="allow"`; extras pass through rather than 500 |
| Upstream changes a field's type | Type traps documented in §7.2 and pinned by tests; a mismatch surfaces as a 404 with the validation error, not a 500 |
| Quota exhaustion | Admin-only routes; no public exposure; caching deferred but noted |
| Upstream slow or down | 15s timeout → 504, distinct from a 502 |
| Secrets leaking to logs | Only URL and query params are logged; headers never are |
