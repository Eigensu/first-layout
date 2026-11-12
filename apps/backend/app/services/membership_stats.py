"""Membership numbers, recomputed one tournament at a time (spec §6.2a).

Run by scripts/refresh_membership_stats.py: on a schedule while a tournament
is live, and once more after it completes, when its numbers become final.

It also repairs rows. app/services/membership.py writes them inline and logs
rather than raises when that fails, so anyone with a team here but no row gets
one now, and a member who has played is marked as having played.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Iterable, List, Set, Tuple

from beanie import PydanticObjectId
from beanie.operators import In
from pymongo import UpdateOne
from pymongo.errors import DuplicateKeyError

from app.common.datetime_utils import to_utc_naive, utc_now
from app.common.enums.enrollments import EnrollmentStatus
from app.models.contest import Contest
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.tournament import Tournament
from app.models.tournament_membership import STATUS_PLAYED, TournamentMembership
from app.models.user import User
from app.services.standings import contest_standings
from app.utils.tenant import TenantId, scoped

UserId = PydanticObjectId


@dataclass
class RefreshReport:
    slug: str
    members: int  # rows whose numbers were written
    created: int  # rows the inline writes had missed


@dataclass
class _Activity:
    """What each person did in one tournament, keyed by user id."""

    teams_count: Dict[UserId, int] = field(default_factory=dict)
    first_team_at: Dict[UserId, datetime] = field(default_factory=dict)
    contests_count: Dict[UserId, int] = field(default_factory=dict)
    # Latest team or entry: the profile orders tournaments by it.
    last_active: Dict[UserId, datetime] = field(default_factory=dict)
    best_rank: Dict[UserId, int] = field(default_factory=dict)
    total_points: Dict[UserId, float] = field(
        default_factory=lambda: defaultdict(float)
    )
    # Everyone with a team or an entry. Filled once the counts are in, and read
    # once per member, so it is built once rather than on every read.
    played: Set[UserId] = field(default_factory=set)

    def saw(self, user_id: UserId, when) -> None:
        if when is not None:
            when = to_utc_naive(when)
            self.last_active[user_id] = max(self.last_active.get(user_id, when), when)


async def refresh_tournament(tournament: Tournament) -> RefreshReport:
    """Recompute every member's numbers in one tournament.

    teams_count counts the teams they made, contests_count the contests they
    have an active entry in. best_rank is their best leaderboard place in any
    contest, and total_points sums their entry's points across contests: one
    active entry per person per contest, so nothing is counted twice.
    """
    now = utc_now()
    activity = await _activity(tournament.id)

    members = {
        m.user_id: m
        async for m in TournamentMembership.find(
            TournamentMembership.tournament_id == tournament.id
        )
    }
    created = await _create_missing_rows(tournament, activity, members, now)

    writes = [
        write
        for user_id, row in members.items()
        for write in _writes(row, user_id, activity, now)
    ]
    if writes:
        await TournamentMembership.get_motor_collection().bulk_write(
            writes, ordered=False
        )

    return RefreshReport(slug=tournament.slug, members=len(members), created=created)


async def _activity(tid: TenantId) -> _Activity:
    activity = _Activity()

    teams = scoped(Team, tid).aggregate(
        [
            {
                "$group": {
                    "_id": "$user_id",
                    "count": {"$sum": 1},
                    "first": {"$min": "$created_at"},
                    "last": {"$max": "$created_at"},
                }
            }
        ]
    )
    for row in await teams.to_list():
        activity.teams_count[row["_id"]] = row["count"]
        activity.first_team_at[row["_id"]] = row["first"]
        activity.saw(row["_id"], row["last"])

    entries = (
        scoped(TeamContestEnrollment, tid)
        .find({"status": EnrollmentStatus.ACTIVE})
        .aggregate(
            [
                {
                    "$group": {
                        "_id": "$user_id",
                        "contests": {"$addToSet": "$contest_id"},
                        "last": {"$max": "$enrolled_at"},
                    }
                }
            ]
        )
    )
    for row in await entries.to_list():
        activity.contests_count[row["_id"]] = len(row["contests"])
        activity.saw(row["_id"], row["last"])

    async for contest in scoped(Contest, tid):
        placed = set()
        for rank, (_, user, points) in enumerate(
            await contest_standings(contest.id, tid), start=1
        ):
            if user.id in placed:
                continue
            placed.add(user.id)
            activity.best_rank[user.id] = min(
                activity.best_rank.get(user.id, rank), rank
            )
            activity.total_points[user.id] += points

    activity.played = set(activity.teams_count) | set(activity.contests_count)
    return activity


async def _create_missing_rows(
    tournament: Tournament,
    activity: _Activity,
    members: Dict[UserId, TournamentMembership],
    now: datetime,
) -> int:
    """Give everyone who played but has no row one, and add it to `members`."""
    missing = activity.played - set(members)
    if not missing:
        return 0
    created = 0
    for user in await User.find(In(User.id, list(missing))).to_list():
        started = activity.first_team_at.get(user.id) or now
        row = TournamentMembership(
            user_id=user.id,
            tournament_id=tournament.id,
            tournament_slug=tournament.slug,
            display_name=user.username,
            status=STATUS_PLAYED,
            joined_at=started,
            first_played_at=started,
        )
        try:
            await row.insert()
            created += 1
        except DuplicateKeyError:
            # Written inline since the read above.
            row = await TournamentMembership.find_one(
                TournamentMembership.user_id == user.id,
                TournamentMembership.tournament_id == tournament.id,
            )
        members[user.id] = row
    return created


def _writes(
    row: TournamentMembership, user_id: UserId, activity: _Activity, now: datetime
) -> List[UpdateOne]:
    played = user_id in activity.played
    update = {
        "stats": {
            "teams_count": activity.teams_count.get(user_id, 0),
            "contests_count": activity.contests_count.get(user_id, 0),
            "best_rank": activity.best_rank.get(user_id),
            "total_points": activity.total_points.get(user_id, 0.0),
            "refreshed_at": now,
        }
    }
    if played:
        update["status"] = STATUS_PLAYED
    writes = [UpdateOne({"_id": row.id}, {"$set": update})]

    latest = activity.last_active.get(user_id)
    if latest is not None:
        # Only forward: a later play written inline since this job read is
        # kept. The condition is in the query, so it holds even then.
        writes.append(
            UpdateOne(
                {
                    "_id": row.id,
                    "$or": [
                        {"last_active_at": None},
                        {"last_active_at": {"$lt": latest}},
                    ],
                },
                {"$set": {"last_active_at": latest}},
            )
        )
    if played and row.first_played_at is None:
        writes.append(
            UpdateOne(
                {"_id": row.id, "first_played_at": None},
                {
                    "$set": {
                        "first_played_at": activity.first_team_at.get(user_id) or now
                    }
                },
            )
        )
    return writes


async def live_play_counts(
    user_id: UserId, tournament_ids: Iterable[PydanticObjectId]
) -> Dict[PydanticObjectId, Tuple[int, int]]:
    """(teams made, contests entered) for one person in each tournament, now.

    The job also writes these, but only on its schedule, so a team made since
    its last run would be missing from the profile while the tournament already
    shows as played. Counting them takes two cheap queries per tournament (spec
    §6.2's table); only best_rank and total_points need the job.
    """
    counts = {}
    for tid in tournament_ids:
        teams = await scoped(Team, tid).find(Team.user_id == user_id).count()
        entries = await (
            scoped(TeamContestEnrollment, tid)
            .find({"user_id": user_id, "status": EnrollmentStatus.ACTIVE})
            .to_list()
        )
        counts[tid] = (teams, len({e.contest_id for e in entries}))
    return counts
