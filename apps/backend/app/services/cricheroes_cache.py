"""A server-side cache of CricHeroes tournament data, kept fresh on a schedule.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6.7. Anything shown to visitors is
read from here (`read`), never from CricHeroes per request: every call is
charged against a quota of about 274 a day (§6.2), and one busy page would
spend it in minutes.

`sync` keeps the cache fresh, from the scheduled job
(scripts/sync_cricheroes.py) or an admin's "refresh now". It is driven by
results, not by the clock:

- each run reads the tournament's match list: one call;
- the standings, MVP table and leaderboards only change when a match is
  completed, so they are read again only when the completed matches' results
  differ from the last time they were read -- or when they are older than
  CRICHEROES_SNAPSHOT_MAX_AGE_HOURS, in case CricHeroes correct something
  without a result changing.

So an hourly run costs 24 calls a day per tournament, plus 4 per completed
match and 4 a day for the age check: about 60 a day for both tournaments
CricHeroes serve us, a fifth of the daily budget. During a match the standings
are a match behind; that is the price.

Each run also scores the contests that take their points from CricHeroes
(app/services/cricheroes_points.py, spec §9.3), reading each completed match's
MVP table about twice -- and nothing at all for a tournament no such contest
uses.

One refresh of a tournament runs at a time, across processes: the scheduled
job and walle-api are separate services, so the claim is held in the
database, not in memory.

A failed refresh keeps the last good data and records why, so a CricHeroes
outage shows stale data rather than none.
"""

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable, Dict, List, Optional, Type

from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from app.common.datetime_utils import to_ist, to_utc_naive, utc_now
from app.models.cricheroes import CricHeroesSnapshot
from app.schemas.admin.cricheroes_ops import SnapshotStatus, SyncReport
from app.schemas.cricheroes import (
    BattingLeaderboardEntry,
    BowlingLeaderboardEntry,
    PlayerMvp,
    PointTableRow,
    TournamentMatch,
)
from app.services import cricheroes_points
from app.services.cricheroes_client import CricHeroesClient
from app.services.cricheroes_errors import CricHeroesConfigError, CricHeroesError
from config.settings import get_settings

logger = logging.getLogger("app.cricheroes")

# A tournament refreshed this recently is not refreshed again, so pressing
# "refresh now" twice, or the scheduled run right after one, costs nothing.
MIN_REFRESH_INTERVAL = timedelta(minutes=5)
# How long a claim on a tournament's refresh holds. Longer than any run --
# five requests, plus at most cricheroes_points.MAX_READS_PER_RUN MVP tables,
# of at most 15 s each: under four minutes -- so a live run is never
# overtaken, and short enough that a run that died holding it is soon
# forgotten.
CLAIM_TIMEOUT = timedelta(minutes=10)


@dataclass(frozen=True)
class Resource:
    """One piece of a tournament's data that is kept cached."""

    name: str
    model: Type[BaseModel]
    fetch: Callable[[CricHeroesClient, int], Awaitable[Any]]


MATCHES = Resource(
    "matches", TournamentMatch, lambda c, t: c.get_tournament_match_list(t)
)
# Read again only when completed results change, or they grow old.
DEPENDENTS = (
    Resource(
        "point-table", PointTableRow, lambda c, t: c.get_tournament_point_table(t)
    ),
    Resource("mvp", PlayerMvp, lambda c, t: c.get_tournament_player_mvp(t)),
    Resource(
        "batting-leaderboard",
        BattingLeaderboardEntry,
        lambda c, t: c.get_tournament_batting_leaderboard(t),
    ),
    Resource(
        "bowling-leaderboard",
        BowlingLeaderboardEntry,
        lambda c, t: c.get_tournament_bowling_leaderboard(t),
    ),
)
RESOURCES: Dict[str, Resource] = {r.name: r for r in (MATCHES, *DEPENDENTS)}

# Everything but the cached data, for decisions and the status view.
WITHOUT_DATA = {"data": 0}


def _key(resource: str, tournament_id: int) -> str:
    return f"{resource}:{tournament_id}"


def _now() -> datetime:
    return utc_now()


def _when(moment: Optional[datetime]) -> Optional[datetime]:
    # For comparison with _now(): naive UTC, which is what MongoDB hands back.
    return to_utc_naive(moment) if moment is not None else None


def _shown(moment: Optional[datetime]) -> Optional[datetime]:
    # For display only.
    return to_ist(moment) if moment is not None else None


def results_digest(matches: List[TournamentMatch]) -> str:
    """A digest of the completed matches' results.

    It changes when a match is completed or a completed result is corrected,
    and not while a match is in play.
    """
    completed = sorted(
        # Sorted as text: CricHeroes repeat rows (§8.2), and two rows of one
        # match differing in a field that is missing from one would make
        # tuples of None and text compare, which Python refuses.
        json.dumps(
            [
                m.match_id,
                m.match_result,
                m.winning_team_id,
                m.team_a_summary,
                m.team_b_summary,
            ]
        )
        for m in matches
        if cricheroes_points.is_completed(m)
    )
    return hashlib.sha256(json.dumps(completed).encode()).hexdigest()[:16]


def _dump(value: Any) -> Any:
    # Stored under CricHeroes' field names, so it reads back through the same
    # models -- aliases and type quirks included -- as a live call.
    if isinstance(value, list):
        return [item.model_dump(mode="json", by_alias=True) for item in value]
    return value.model_dump(mode="json", by_alias=True)


async def _upsert(resource: str, tournament_id: int, fields: dict) -> None:
    key = _key(resource, tournament_id)
    update = {
        "$set": {
            "resource": resource,
            "cricheroes_tournament_id": tournament_id,
            **fields,
        }
    }
    collection = CricHeroesSnapshot.get_motor_collection()
    try:
        await collection.update_one({"key": key}, update, upsert=True)
    except DuplicateKeyError:
        # Another writer inserted the document between our lookup and our
        # insert. It exists now, so the retry is a plain update.
        await collection.update_one({"key": key}, update, upsert=True)


async def _save(
    resource: str, tournament_id: int, data: Any, digest: str, when: datetime
) -> None:
    dumped = _dump(data)
    await _upsert(
        resource,
        tournament_id,
        {
            "data": dumped,
            "rows": len(dumped) if isinstance(dumped, list) else 1,
            "fetched_at": when,
            "results_digest": digest,
            "last_error": None,
            "last_error_at": None,
        },
    )


async def _save_error(
    resource: str, tournament_id: int, error: Exception, when: datetime
) -> None:
    # Keeps whatever data was there: stale beats nothing.
    await _upsert(
        resource,
        tournament_id,
        {"last_error": str(error)[:500], "last_error_at": when},
    )


# -- reading ---------------------------------------------------------------


@dataclass
class Cached:
    data: Any  # a list of the resource's model
    fetched_at: datetime
    # Why the last refresh failed, if it did; `data` is from before that.
    last_error: Optional[str] = None


async def read(resource: str, tournament_id: int) -> Optional[Cached]:
    """The cached resource, or None if it has never been fetched."""
    spec = RESOURCES[resource]
    snapshot = await CricHeroesSnapshot.find_one(
        CricHeroesSnapshot.key == _key(resource, tournament_id)
    )
    if snapshot is None or snapshot.fetched_at is None:
        return None
    rows = snapshot.data if isinstance(snapshot.data, list) else [snapshot.data]
    return Cached(
        data=[spec.model.model_validate(row) for row in rows],
        fetched_at=_shown(snapshot.fetched_at),
        last_error=snapshot.last_error,
    )


async def status() -> List[SnapshotStatus]:
    """Every cached resource, without its data, for the admin status view."""
    documents = (
        await CricHeroesSnapshot.get_motor_collection()
        .find({}, WITHOUT_DATA)
        .sort("key", 1)
        .to_list(None)
    )
    return [
        SnapshotStatus(
            resource=d["resource"],
            cricheroes_tournament_id=d["cricheroes_tournament_id"],
            fetched_at=_shown(d.get("fetched_at")),
            rows=d.get("rows", 0),
            last_error=d.get("last_error"),
            last_error_at=_shown(d.get("last_error_at")),
        )
        for d in documents
    ]


# -- refreshing ------------------------------------------------------------


async def _claim(tournament_id: int, now: datetime) -> Optional[str]:
    """Claim the right to refresh a tournament now.

    None when claimed; otherwise why not. One atomic write on the match
    list's document: it matches only when the tournament was not refreshed in
    the last MIN_REFRESH_INTERVAL and nobody holds a live claim. When the
    document exists but does not match, the upsert's insert collides with it
    on the unique key -- that collision is the refusal.
    """
    collection = CricHeroesSnapshot.get_motor_collection()
    key = _key(MATCHES.name, tournament_id)
    try:
        await collection.update_one(
            {
                "key": key,
                "$and": [
                    {
                        "$or": [
                            {"fetched_at": None},
                            {"fetched_at": {"$lt": now - MIN_REFRESH_INTERVAL}},
                        ]
                    },
                    {
                        "$or": [
                            {"claimed_at": None},
                            {"claimed_at": {"$lt": now - CLAIM_TIMEOUT}},
                        ]
                    },
                ],
            },
            {
                "$set": {
                    "resource": MATCHES.name,
                    "cricheroes_tournament_id": tournament_id,
                    "claimed_at": now,
                }
            },
            upsert=True,
        )
        return None
    except DuplicateKeyError:
        pass
    current = await collection.find_one({"key": key}, WITHOUT_DATA) or {}
    fetched = _when(current.get("fetched_at"))
    if fetched is not None and now - fetched < MIN_REFRESH_INTERVAL:
        return f"refreshed {int((now - fetched).total_seconds() // 60)} minute(s) ago"
    return "another refresh of it is running"


async def _release(tournament_id: int, claimed_at: datetime) -> None:
    # Only our own claim: a run that overran CLAIM_TIMEOUT must not release
    # the claim of the run that took over from it.
    await CricHeroesSnapshot.get_motor_collection().update_one(
        {"key": _key(MATCHES.name, tournament_id), "claimed_at": claimed_at},
        {"$set": {"claimed_at": None}},
    )


async def sync_tournament(
    client: CricHeroesClient,
    tournament_id: int,
    *,
    force: bool = False,
    now: Optional[datetime] = None,
) -> SyncReport:
    """Refresh one tournament's cache; see the module docstring for what.

    `force` reads every resource, changed results or not. A missing
    credential is raised (it would fail every call); any other failure is
    recorded in the report and on the resource, and the run goes on.
    """
    now = to_utc_naive(now) if now is not None else _now()
    reason = await _claim(tournament_id, now)
    if reason is not None:
        return SyncReport(tournament_id=tournament_id, skipped=reason)
    try:
        return await _sync(client, tournament_id, force, now)
    finally:
        await _release(tournament_id, now)


async def _sync(
    client: CricHeroesClient, tournament_id: int, force: bool, now: datetime
) -> SyncReport:
    report = SyncReport(tournament_id=tournament_id)
    documents = (
        await CricHeroesSnapshot.get_motor_collection()
        .find({"cricheroes_tournament_id": tournament_id}, WITHOUT_DATA)
        .to_list(None)
    )
    cached = {d["resource"]: d for d in documents}

    try:
        matches = await MATCHES.fetch(client, tournament_id)
    except CricHeroesConfigError:
        raise
    except CricHeroesError as exc:
        # Without the match list there is nothing to decide with; the next
        # run tries again.
        await _save_error(MATCHES.name, tournament_id, exc, now)
        report.failed[MATCHES.name] = str(exc)
        return report
    digest = results_digest(matches)
    await _save(MATCHES.name, tournament_id, matches, digest, now)
    report.refreshed.append(MATCHES.name)
    previous = cached.get(MATCHES.name, {}).get("results_digest")
    report.results_changed = previous != digest

    max_age = timedelta(hours=get_settings().cricheroes_snapshot_max_age_hours)
    for resource in DEPENDENTS:
        snapshot = cached.get(resource.name, {})
        fetched = _when(snapshot.get("fetched_at"))
        # Compared with its own digest, not with "did results change this
        # run": a resource whose read failed last time is still behind, and
        # is retried until it catches up.
        due = (
            force
            or fetched is None
            or snapshot.get("results_digest") != digest
            or now - fetched >= max_age
        )
        if not due:
            report.unchanged.append(resource.name)
            continue
        try:
            data = await resource.fetch(client, tournament_id)
        except CricHeroesConfigError:
            raise
        except CricHeroesError as exc:
            await _save_error(resource.name, tournament_id, exc, now)
            report.failed[resource.name] = str(exc)
            continue
        await _save(resource.name, tournament_id, data, digest, now)
        report.refreshed.append(resource.name)

    # Contest points (spec §9.3), only for a tournament some opted-in contest
    # uses: otherwise no MVP table is read at all.
    contests = await cricheroes_points.contests_using(tournament_id)
    if contests:
        reads = await cricheroes_points.read_mvp_tables(
            client, tournament_id, matches, now
        )
        report.mvp_tables_read = reads.read
        report.mvp_tables_failed = reads.failed
        outcome = await cricheroes_points.score_contests(
            contests, tournament_id, matches
        )
        report.contests_scored = sum(1 for why in outcome.values() if why is None)
        report.contests_failed = {
            label: why for label, why in outcome.items() if why is not None
        }
    return report


async def sync(
    client: CricHeroesClient,
    tournament_ids: Optional[List[int]] = None,
    *,
    force: bool = False,
) -> List[SyncReport]:
    """Refresh every configured tournament (CRICHEROES_SYNC_TOURNAMENT_IDS),
    or the ones given, one after the other."""
    ids = (
        tournament_ids
        if tournament_ids is not None
        else get_settings().cricheroes_sync_tournaments
    )
    reports = []
    for tournament_id in ids:
        report = await sync_tournament(client, tournament_id, force=force)
        logger.info(
            "CricHeroes sync %s: refreshed %s, unchanged %s, failed %s%s",
            tournament_id,
            report.refreshed,
            report.unchanged,
            sorted(report.failed),
            f", skipped: {report.skipped}" if report.skipped else "",
        )
        reports.append(report)
    return reports
