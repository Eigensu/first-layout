"""Contest points from CricHeroes' match MVP tables.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9.3. A contest that opts in
(`Contest.points_from_cricheroes`) takes its players' points from CricHeroes
instead of the admin points form:

- it covers every completed match of the CricHeroes tournament its own
  tournament is linked to (`Tournament.cricheroes_tournament_id`) that starts
  inside the contest's window -- for a daily contest with allowed teams, only
  matches between two of them;
- a player's points in it are the sum of their MVP `total` over those
  matches, written to `PlayerContestPoints` as the admin form writes them, so
  standings and the captain and vice-captain multipliers work unchanged;
- CricHeroes players are matched to ours by `cricheroes_player_id`, which the
  player import sets (§9.1). Anyone unlinked scores nothing here, and is
  listed so an admin can link them.

The MVP formula is CricHeroes' own (MVP 2.0, §13.5), not configurable.

**Quota.** A match's MVP table is read when the match is completed, once more
a day later in case the scorer corrected the scorecard, and again only if its
result changes: about two calls a match. Reads happen in the scheduled sync
(§6.7), at most MAX_READS_PER_RUN a run, and only for a CricHeroes tournament
some opted-in contest uses -- with none, this costs nothing. Scoring reads
only what is stored, so it can also run straight away when an admin turns the
switch on or moves a contest's dates.

This module never reads the cache itself; callers pass the match list in, so
the cache (which calls into here during a sync) and this module do not import
each other.
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.common.datetime_utils import to_utc_naive, utc_now
from app.common.enums.contests import ContestType
from app.models.admin.player import Player
from app.models.contest import Contest
from app.models.cricheroes import CricHeroesMatchMvp
from app.models.player_contest_points import PlayerContestPoints
from app.models.tournament import Tournament
from app.schemas.admin.cricheroes_points import ContestPointsSummary, CountedMatch
from app.schemas.cricheroes import PlayerMvp, TournamentMatch
from app.services.cricheroes_client import CricHeroesClient
from app.services.cricheroes_errors import CricHeroesConfigError, CricHeroesError
from app.utils.tenant import get_scoped, scoped

logger = logging.getLogger("app.cricheroes")

# MVP tables read in one sync run, at most. Bounds a run's length -- each
# read may take up to the 15 s timeout, and a run's claim on the tournament
# lasts 10 minutes (§6.7) -- and its cost when many matches are due at once,
# such as when a contest is switched on halfway through a tournament. The rest
# are read on later runs.
MAX_READS_PER_RUN = 10
# A table is read a second time this long after the first, in case the scorer
# corrected the scorecard; after that it is settled.
SETTLE_AFTER = timedelta(hours=24)
READS_TO_SETTLE = 2
# A table whose read failed is tried again after this long, not every run: a
# match CricHeroes have no table for would otherwise cost a call an hour.
RETRY_FAILED_AFTER = timedelta(hours=3)


def is_completed(match: TournamentMatch) -> bool:
    """A match that has been played to a result (or abandoned)."""
    return match.type == 3 or (match.status or "").casefold() == "past"


def result_key(match: TournamentMatch) -> str:
    """The match's result, as text: it changes if the result is corrected."""
    return json.dumps(
        [
            match.match_result,
            match.winning_team_id,
            match.team_a_summary,
            match.team_b_summary,
        ]
    )


def match_start(match: TournamentMatch) -> Optional[datetime]:
    """When the match starts, as naive UTC; None if CricHeroes did not say."""
    if not match.match_date_time:
        return None
    try:
        parsed = datetime.fromisoformat(match.match_date_time.replace("Z", "+00:00"))
    except ValueError:
        return None
    return to_utc_naive(parsed)


def _name_key(name: Optional[str]) -> str:
    # The player import compares team names the same way (§9.1).
    return " ".join((name or "").split()).casefold()


def _points(value: Optional[str]) -> float:
    # MVP points are strings with three decimals ("8.719", §8.2).
    try:
        return float(value) if value not in (None, "") else 0.0
    except ValueError:
        return 0.0


def _unique(match_ids: Iterable[int]) -> List[int]:
    return list(dict.fromkeys(match_ids))


# -- which contests use a CricHeroes tournament ------------------------------


async def contests_using(cricheroes_tournament_id: int) -> List[Contest]:
    """The opted-in contests of every tournament linked to this one."""
    tournaments = await Tournament.find(
        Tournament.cricheroes_tournament_id == cricheroes_tournament_id
    ).to_list()
    contests: List[Contest] = []
    for tournament in tournaments:
        contests += (
            await scoped(Contest, tournament.id)
            .find({"points_from_cricheroes": True})
            .to_list()
        )
    return contests


async def linked_tournament_id(contest: Contest) -> Optional[int]:
    """The CricHeroes tournament the contest's tournament is linked to."""
    if contest.tournament_id is None:
        return None
    tournament = await Tournament.get(contest.tournament_id)
    return tournament.cricheroes_tournament_id if tournament else None


# -- reading MVP tables -------------------------------------------------------


@dataclass
class TableReads:
    read: List[int] = field(default_factory=list)
    failed: Dict[str, str] = field(default_factory=dict)


def _due(
    match: TournamentMatch, stored: Optional[CricHeroesMatchMvp], now: datetime
) -> bool:
    if stored is None:
        return True
    if stored.fetched_at is None or stored.result_key != result_key(match):
        # Never read, or the result has changed since: due, unless the last
        # attempt failed recently.
        failed_at = stored.last_error_at
        return failed_at is None or now - to_utc_naive(failed_at) >= RETRY_FAILED_AFTER
    if stored.reads >= READS_TO_SETTLE:
        return False
    if stored.last_error_at is not None and (
        now - to_utc_naive(stored.last_error_at) < RETRY_FAILED_AFTER
    ):
        return False
    return now - to_utc_naive(stored.fetched_at) >= SETTLE_AFTER


async def _store(match_id: int, cricheroes_tournament_id: int, fields: dict) -> None:
    collection = CricHeroesMatchMvp.get_motor_collection()
    update = {
        "$set": {
            "match_id": match_id,
            "cricheroes_tournament_id": cricheroes_tournament_id,
            **fields,
        }
    }
    try:
        await collection.update_one({"match_id": match_id}, update, upsert=True)
    except DuplicateKeyError:
        # Another writer inserted it first; it exists now, so this updates it.
        await collection.update_one({"match_id": match_id}, update, upsert=True)


async def read_mvp_tables(
    client: CricHeroesClient,
    cricheroes_tournament_id: int,
    matches: List[TournamentMatch],
    now: Optional[datetime] = None,
) -> TableReads:
    """Read the MVP tables that are due, oldest match first, at most
    MAX_READS_PER_RUN. A missing credential is raised; any other failure is
    recorded on the match and in the result, and the next match is tried."""
    now = to_utc_naive(now) if now is not None else utc_now()
    stored = {
        doc.match_id: doc
        for doc in await CricHeroesMatchMvp.find(
            CricHeroesMatchMvp.cricheroes_tournament_id == cricheroes_tournament_id
        ).to_list()
    }
    completed = {m.match_id: m for m in matches if is_completed(m)}
    due = sorted(
        (m for m in completed.values() if _due(m, stored.get(m.match_id), now)),
        key=lambda m: (match_start(m) or datetime.max, m.match_id),
    )
    reads = TableReads()
    for match in due[:MAX_READS_PER_RUN]:
        previous = stored.get(match.match_id)
        key = result_key(match)
        try:
            rows = await client.get_match_player_mvp(match.match_id)
        except CricHeroesConfigError:
            raise
        except CricHeroesError as exc:
            await _store(
                match.match_id,
                cricheroes_tournament_id,
                {"last_error": str(exc)[:500], "last_error_at": now},
            )
            reads.failed[str(match.match_id)] = str(exc)
            continue
        same_result = previous is not None and previous.result_key == key
        await _store(
            match.match_id,
            cricheroes_tournament_id,
            {
                # Under CricHeroes' field names, so they read back through
                # PlayerMvp as a live call would.
                "data": [r.model_dump(mode="json", by_alias=True) for r in rows],
                "fetched_at": now,
                "result_key": key,
                # A changed result starts the count again.
                "reads": (previous.reads if same_result else 0) + 1,
                "last_error": None,
                "last_error_at": None,
            },
        )
        reads.read.append(match.match_id)
    return reads


# -- scoring contests ---------------------------------------------------------


def _counts_for(contest: Contest, match: TournamentMatch) -> bool:
    start = match_start(match)
    if start is None:
        return False
    if not (to_utc_naive(contest.start_at) <= start <= to_utc_naive(contest.end_at)):
        return False
    if contest.contest_type == ContestType.DAILY and contest.allowed_teams:
        allowed = {_name_key(team) for team in contest.allowed_teams}
        return (
            _name_key(match.team_a_name) in allowed
            and _name_key(match.team_b_name) in allowed
        )
    return True


@dataclass
class ContestPlan:
    summary: ContestPointsSummary
    # Our player id -> the contest's points for them.
    points: Dict[PydanticObjectId, float]


async def plan_contest(
    contest: Contest,
    cricheroes_tournament_id: Optional[int],
    matches: List[TournamentMatch],
) -> ContestPlan:
    """Work out a contest's points from the stored MVP tables. Writes nothing
    and calls nobody."""
    summary = ContestPointsSummary(
        contest_id=str(contest.id),
        points_from_cricheroes=contest.points_from_cricheroes,
        cricheroes_tournament_id=cricheroes_tournament_id,
    )
    if cricheroes_tournament_id is None:
        return ContestPlan(summary=summary, points={})

    covered = [m for m in matches if is_completed(m) and _counts_for(contest, m)]
    ids = _unique(m.match_id for m in covered)
    tables = {
        doc.match_id: doc
        for doc in await CricHeroesMatchMvp.find(
            {"match_id": {"$in": ids}, "fetched_at": {"$ne": None}}
        ).to_list()
    }
    by_id = {m.match_id: m for m in covered}

    totals: Dict[int, float] = {}
    names: Dict[int, str] = {}
    for match_id in ids:
        match = by_id[match_id]
        table = tables.get(match_id)
        if table is None:
            summary.matches_awaiting_mvp.append(match_id)
            continue
        rows = [PlayerMvp.model_validate(row) for row in table.data]
        # One row per player: CricHeroes have repeated rows before (§8.2), and
        # a repeat must not count a player's points twice.
        seen = set()
        for row in rows:
            if row.player_id in seen:
                continue
            seen.add(row.player_id)
            totals[row.player_id] = totals.get(row.player_id, 0.0) + _points(row.total)
            names[row.player_id] = (
                f"{row.name} ({row.team_name})" if row.team_name else row.name
            )
        summary.matches_counted.append(
            CountedMatch(
                match_id=match_id,
                match_date_time=match.match_date_time,
                teams=f"{match.team_a_name or '?'} vs {match.team_b_name or '?'}",
                players=len(seen),
            )
        )

    players = (
        await scoped(Player, contest.tournament_id)
        .find({"cricheroes_player_id": {"$in": list(totals)}})
        .to_list()
        if totals
        else []
    )
    ours: Dict[int, Player] = {}
    for player in players:
        ours.setdefault(player.cricheroes_player_id, player)

    points: Dict[PydanticObjectId, float] = {}
    for cricheroes_id, total in totals.items():
        player = ours.get(cricheroes_id)
        if player is None:
            summary.unlinked_players.append(names[cricheroes_id])
            continue
        points[player.id] = round(total, 3)
    summary.unlinked_players.sort()
    summary.players_scored = len(points)
    return ContestPlan(summary=summary, points=points)


async def score_contest(
    contest: Contest,
    cricheroes_tournament_id: Optional[int],
    matches: List[TournamentMatch],
) -> ContestPointsSummary:
    """Write a contest's points from the stored MVP tables.

    The contest's points become exactly CricHeroes': anyone with points here
    who scores nothing on CricHeroes is set to 0, so hand-entered points from
    before the switch was turned on do not linger. A full contest's points
    are mirrored into `Player.points`, as the admin form does.
    """
    plan = await plan_contest(contest, cricheroes_tournament_id, matches)
    if cricheroes_tournament_id is None:
        return plan.summary
    now = utc_now()
    existing = {
        doc.player_id: doc
        for doc in await scoped(PlayerContestPoints, contest.tournament_id)
        .find({"contest_id": contest.id})
        .to_list()
    }
    wanted = dict(plan.points)
    for player_id in existing:
        wanted.setdefault(player_id, 0.0)

    changed: Dict[PydanticObjectId, float] = {}
    for player_id, points in wanted.items():
        doc = existing.get(player_id)
        if doc is None:
            await PlayerContestPoints(
                tournament_id=contest.tournament_id,
                contest_id=contest.id,
                player_id=player_id,
                points=points,
                updated_at=now,
            ).insert()
        elif float(doc.points or 0.0) != points:
            doc.points = points
            doc.updated_at = now
            await doc.save()
        else:
            continue
        changed[player_id] = points

    if contest.contest_type != ContestType.DAILY:
        for player_id, points in changed.items():
            # Only these two fields: a whole-document save would write back
            # whatever else this process last read of the player.
            await (
                scoped(Player, contest.tournament_id)
                .find({"_id": player_id})
                .update_many({"$set": {"points": points, "updated_at": now}})
            )
    return plan.summary


def _label(contest: Contest) -> str:
    # Codes are unique only within a tournament, and two tournaments may be
    # linked to the same CricHeroes tournament.
    return f"{contest.code}/{contest.id}"


async def score_contests(
    contests: List[Contest],
    cricheroes_tournament_id: int,
    matches: List[TournamentMatch],
) -> Dict[str, Optional[str]]:
    """Score each contest; "<code>/<id>" -> None when scored, else why not.
    One contest failing does not stop the others.

    Each contest is read again just before it is scored. The sync lists them
    before its MVP reads, which can take minutes, and in that time an admin may
    turn the switch off and enter points by hand, move the window, or unlink
    the tournament. Scoring the listed copy would overwrite those points, and
    with the switch off no later sync would put them right. A contest that has
    since been switched off, deleted or moved to another CricHeroes tournament
    is left out of the outcome: it is neither scored nor failed."""
    outcome: Dict[str, Optional[str]] = {}
    for listed in contests:
        label = _label(listed)
        try:
            contest = await get_scoped(Contest, listed.tournament_id, listed.id)
            if (
                contest is None
                or not contest.points_from_cricheroes
                or await linked_tournament_id(contest) != cricheroes_tournament_id
            ):
                continue
            await score_contest(contest, cricheroes_tournament_id, matches)
            outcome[label] = None
        except Exception as exc:  # noqa: BLE001 -- reported, never fatal
            logger.exception("Scoring contest %s from CricHeroes failed", listed.id)
            outcome[label] = str(exc)[:500]
    return outcome
