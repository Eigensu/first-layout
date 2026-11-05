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

A failed refresh keeps the last good data and records why, so a CricHeroes
outage shows stale data rather than none.
"""

import asyncio
import hashlib
import json
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Type

from pydantic import BaseModel

from app.models.cricheroes import CricHeroesSnapshot
from app.schemas.cricheroes import (
    BattingLeaderboardEntry,
    BowlingLeaderboardEntry,
    PlayerMvp,
    PointTableRow,
    TournamentMatch,
)
from app.services.cricheroes_client import CricHeroesClient
from app.services.cricheroes_errors import CricHeroesConfigError, CricHeroesError
from config.settings import get_settings

logger = logging.getLogger("app.cricheroes")

# A tournament refreshed this recently is not refreshed again, so pressing
# "refresh now" twice, or a run overlapping the scheduled one, costs nothing.
MIN_REFRESH_INTERVAL = timedelta(minutes=5)


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


def _key(resource: str, tournament_id: int) -> str:
    return f"{resource}:{tournament_id}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(moment: Optional[datetime]) -> Optional[datetime]:
    # MongoDB hands datetimes back without a timezone; they are UTC.
    if moment is not None and moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment


def results_digest(matches: List[TournamentMatch]) -> str:
    """A digest of the completed matches' results.

    It changes when a match is completed or a completed result is corrected,
    and not while a match is in play.
    """
    completed = sorted(
        (
            m.match_id,
            m.match_result,
            m.winning_team_id,
            m.team_a_summary,
            m.team_b_summary,
        )
        for m in matches
        if m.type == 3 or (m.status or "").casefold() == "past"
    )
    return hashlib.sha256(json.dumps(completed).encode()).hexdigest()[:16]


def _dump(value: Any) -> Any:
    # Stored under CricHeroes' field names, so it reads back through the same
    # models -- aliases and type quirks included -- as a live call.
    if isinstance(value, list):
        return [item.model_dump(mode="json", by_alias=True) for item in value]
    return value.model_dump(mode="json", by_alias=True)


async def _save(
    resource: str, tournament_id: int, data: Any, digest: Optional[str], when: datetime
) -> None:
    await CricHeroesSnapshot.get_motor_collection().update_one(
        {"key": _key(resource, tournament_id)},
        {
            "$set": {
                "resource": resource,
                "cricheroes_tournament_id": tournament_id,
                "data": _dump(data),
                "fetched_at": when,
                "results_digest": digest,
                "last_error": None,
                "last_error_at": None,
            }
        },
        upsert=True,
    )


async def _save_error(
    resource: str, tournament_id: int, error: Exception, when: datetime
) -> None:
    # Keeps whatever data was there: stale beats nothing.
    await CricHeroesSnapshot.get_motor_collection().update_one(
        {"key": _key(resource, tournament_id)},
        {
            "$set": {
                "resource": resource,
                "cricheroes_tournament_id": tournament_id,
                "last_error": str(error)[:500],
                "last_error_at": when,
            }
        },
        upsert=True,
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
        fetched_at=_aware(snapshot.fetched_at),
        last_error=snapshot.last_error,
    )


async def status() -> List[CricHeroesSnapshot]:
    """Every cached resource, for the admin status view."""
    return await CricHeroesSnapshot.find_all().sort("key").to_list()


# -- refreshing ------------------------------------------------------------


@dataclass
class SyncReport:
    tournament_id: int
    # Resources read from CricHeroes this run; each was one call.
    refreshed: List[str] = field(default_factory=list)
    # Resources whose cached copy was still current: no call.
    unchanged: List[str] = field(default_factory=list)
    # Resource -> why it could not be read; its cached copy was kept.
    failed: Dict[str, str] = field(default_factory=dict)
    # Set when the whole tournament was passed over, with the reason.
    skipped: Optional[str] = None
    results_changed: bool = False

    @property
    def calls(self) -> int:
        return len(self.refreshed) + len(self.failed)


_locks: Dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)


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
    async with _locks[tournament_id]:
        return await _sync(client, tournament_id, force, now or _now())


async def _sync(
    client: CricHeroesClient, tournament_id: int, force: bool, now: datetime
) -> SyncReport:
    report = SyncReport(tournament_id)
    cached = {
        snapshot.resource: snapshot
        for snapshot in await CricHeroesSnapshot.find(
            CricHeroesSnapshot.cricheroes_tournament_id == tournament_id
        ).to_list()
    }

    last = cached.get(MATCHES.name)
    last_read = _aware(last.fetched_at) if last else None
    if last_read is not None and now - last_read < MIN_REFRESH_INTERVAL:
        ago = int((now - last_read).total_seconds() // 60)
        report.skipped = f"refreshed {ago} minute(s) ago"
        return report

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
    report.results_changed = last is None or last.results_digest != digest

    max_age = timedelta(hours=get_settings().cricheroes_snapshot_max_age_hours)
    for resource in DEPENDENTS:
        snapshot = cached.get(resource.name)
        fetched = _aware(snapshot.fetched_at) if snapshot else None
        # Compared with its own digest, not with "did results change this
        # run": a resource whose read failed last time is still behind, and
        # is retried until it catches up.
        due = (
            force
            or fetched is None
            or snapshot.results_digest != digest
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
