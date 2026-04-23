# MVP Points Sync Integration - Technical Specification

**Project:** first-layout (backend)
**Date:** 2026-04-24
**Status:** Ready for implementation
**Owner:** Backend Team

---

## 1. Objective

Integrate the new external MVP source endpoint:

- `https://mvp-epl.up.railway.app/api/mvp`

into the backend sync service so that:

1. Global player points are updated in `players`.
2. Per-contest player points are updated/upserted in `player_contest_points`.
3. Team totals are recalculated in `teams`.
4. Sync remains safe, idempotent, observable, and scheduler-friendly.

The logic should preserve current behavior in `apps/backend/app/services/points_sync.py`, but replace the source payload dependency from Firebase tournament shape to the MVP API shape.

---

## 2. Current State

### 2.1 Existing Sync Behavior

`sync_player_points()` currently:

1. Fetches a Firebase payload from `FIREBASE_URL`.
2. Computes points via `calculate_points()` from nested stats.
3. Matches DB player names to source names.
4. Bulk updates:
   - `players.points`
   - `player_contest_points.points` for all active contests (upsert)
5. Recomputes each team `total_points` from player points.

### 2.2 New API Behavior

`GET https://mvp-epl.up.railway.app/api/mvp` currently returns:

- HTTP 200
- `application/json`
- Array payload with direct fields:
  - `name: string`
  - `points: number`

Example:

```json
[
  { "name": "Aarav Khandelia", "points": 0 },
  { "name": "Hridaan Jain", "points": 0 }
]
```

This means point calculation from stats is no longer required when this source is used.

---

## 3. Functional Requirements

1. Source endpoint must be configurable via environment variable.
2. Sync must consume direct `name + points` records.
3. Name matching must be resilient to spacing/case differences.
4. Existing per-contest update semantics must be preserved (upsert per active contest).
5. Existing team total recalculation semantics must be preserved.
6. Sync should no-op safely if source is empty or malformed.
7. Sync must log actionable metrics for operations and mismatches.

---

## 4. Non-Functional Requirements

1. Idempotent: repeated runs with same payload produce same DB state.
2. Performance: bulk writes remain `ordered=False`.
3. Reliability: network timeout + structured error handling for source fetch.
4. Observability: logs include counts (source records, matched players, contest upserts, team updates).
5. Backward compatibility: optional fallback strategy supported (see Section 8).

---

## 5. Proposed Design

### 5.1 Config Changes

Add env-driven source configuration in backend settings:

- `MVP_POINTS_SOURCE_URL=https://mvp-epl.up.railway.app/api/mvp`
- `MVP_POINTS_SYNC_TIMEOUT_SECONDS=15`
- `MVP_POINTS_SYNC_INTERVAL_SECONDS=300` (optional replacement for hardcoded constant)

Implementation detail:

- Replace hardcoded `FIREBASE_URL` usage with `MVP_POINTS_SOURCE_URL`.
- Keep a default value in settings for local/dev safety.

### 5.2 Data Contract

Expected source item:

```json
{
  "name": "string",
  "points": 123.45
}
```

Validation rules:

1. `name` must exist and be non-empty after `strip()`.
2. `points` must be numeric or numeric-string parseable to float.
3. Invalid records are skipped with warning logs.

### 5.3 Name Normalization

Use a shared normalizer for matching:

- `normalized = " ".join(name.strip().lower().split())`

This handles:

- case differences
- extra spaces / double spaces
- accidental leading/trailing whitespace

### 5.4 Sync Flow (Revised)

1. Fetch source array from `MVP_POINTS_SOURCE_URL`.
2. Build `name_points_map` directly from source entries.
3. Fetch DB players + active contests.
4. For each DB player:
   - normalize DB name
   - lookup normalized source name
   - if found, queue:
     - players bulk update
     - per-active-contest upsert bulk update
5. Execute player bulk update and contest-points bulk update.
6. Recalculate team totals from refreshed players and bulk update teams.
7. Log summary and mismatch counts.

### 5.5 Unmatched Tracking

Track:

- `source_only_names`: present in source, absent in DB
- `db_only_names`: present in DB, absent in source

Log only counts by default and sample up to N names (for example 10) to avoid noisy logs.

---

## 6. Implementation Plan

### Phase 1: Configuration

1. Introduce new env keys in backend config.
2. Wire `points_sync.py` to use config values instead of hardcoded URL/interval.

### Phase 2: Source Parsing Refactor

1. Add helper function:
   - `fetch_mvp_points_map() -> dict[str, float]`
2. Remove dependence on tournament/category/player nested schema.
3. Keep `calculate_points()` only if fallback mode is needed; otherwise deprecate/remove.

### Phase 3: Matching and Update Hardening

1. Add name normalizer helper.
2. Build normalized map for source and DB players.
3. Add mismatch metrics and concise logs.

### Phase 4: Validation and Rollout

1. Dry run in staging with logs-only mode (optional flag).
2. Verify:
   - players updated
   - player_contest_points upserts updated
   - team totals changed accordingly
3. Deploy with monitoring.

---

## 7. Detailed Pseudocode

```python
async def fetch_mvp_points_map(url: str, timeout_sec: float) -> dict[str, float]:
    async with httpx.AsyncClient(timeout=timeout_sec) as client:
        response = await client.get(url)
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, list):
        raise ValueError("MVP payload must be a list")

    result = {}
    for item in payload:
        if not isinstance(item, dict):
            continue
        raw_name = item.get("name", "")
        raw_points = item.get("points", 0)
        name = normalize_name(raw_name)
        if not name:
            continue
        try:
            points = float(raw_points)
        except (TypeError, ValueError):
            continue
        result[name] = points

    return result

async def sync_player_points():
    name_points_map = await fetch_mvp_points_map(MVP_POINTS_SOURCE_URL, TIMEOUT)
    if not name_points_map:
        log.warning("No valid MVP records")
        return

    db_players = await Player.find_all().to_list()
    active_contests = await Contest.find(Contest.status != "archived").to_list()

    player_bulk = []
    contest_points_bulk = []
    now = datetime.utcnow()

    for db_p in db_players:
        key = normalize_name(db_p.name)
        if key not in name_points_map:
            continue
        new_points = name_points_map[key]

        player_bulk.append(UpdateOne(...set players.points...))
        for contest in active_contests:
            contest_points_bulk.append(UpdateOne(...upsert contest points...))

    execute bulk writes
    recalculate and bulk update teams
    log summary counts
```

---

## 8. Backward Compatibility Strategy

Recommended mode:

- **Primary:** use new MVP endpoint only.

Optional fallback mode:

- If MVP endpoint fails, optionally fetch Firebase and compute via `calculate_points()`.
- Controlled by env:
  - `MVP_POINTS_ENABLE_FIREBASE_FALLBACK=false`

If fallback is disabled, fail safely (log error and skip this cycle).

---

## 9. Error Handling Specification

Error classes to handle:

1. Network errors (`httpx.RequestError`)
2. Non-2xx responses (`httpx.HTTPStatusError`)
3. Invalid JSON / wrong shape (`ValueError`, `TypeError`)
4. Bulk write exceptions (Mongo/pymongo exceptions)

Behavior:

- Log with context (`source_url`, `status_code`, exception type).
- Abort current cycle gracefully; next cycle continues.
- Never crash the background loop.

---

## 10. Logging and Metrics

Minimum log fields per sync run:

1. `source_records_count`
2. `valid_records_count`
3. `matched_players_count`
4. `updated_players_count`
5. `upserted_contest_points_count`
6. `updated_teams_count`
7. `source_only_count`
8. `db_only_count`
9. `duration_ms`

These logs are enough to debug why all points might remain zero.

---

## 11. Testing Strategy

### Unit Tests

1. Name normalization behavior.
2. Source payload parsing and validation.
3. Numeric coercion for points.
4. Empty and malformed payload handling.

### Integration Tests

1. Mock source endpoint returning 3-5 players with non-zero points.
2. Verify DB updates:
   - `players.points`
   - `player_contest_points.points` for active contests
   - `teams.total_points`

### Regression Checks

1. Confirm archived contests are not touched.
2. Confirm no updates when source is empty.
3. Confirm repeated runs are idempotent.

---

## 12. Rollout Checklist

1. Add env vars in all environments.
2. Deploy backend with revised sync service.
3. Trigger manual sync once and verify DB snapshots.
4. Verify API consumer endpoint reflects updated points.
5. Monitor logs for mismatch spikes and parse errors.

---

## 13. Acceptance Criteria

1. Sync job successfully reads from `https://mvp-epl.up.railway.app/api/mvp`.
2. At least one non-zero source point value updates corresponding DB player (when source has non-zero values).
3. `player_contest_points` updates are present for all active contests per matched player.
4. Team totals equal the sum of their current player points after sync.
5. Job remains stable across repeated intervals without crashes.
