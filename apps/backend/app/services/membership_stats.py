"""Membership numbers, recomputed one tournament at a time (spec §6.2a).

Run by scripts/refresh_membership_stats.py: on a schedule while a tournament
is live, and once more after it completes, when its numbers become final.

It also repairs rows. app/services/membership.py writes them inline and logs
rather than raises when that fails, so anyone with a team here but no row gets
one now, and a member who has played is marked as having played.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Dict

from beanie import PydanticObjectId
from beanie.operators import In
from pymongo import UpdateOne
from pymongo.errors import DuplicateKeyError

from app.common.enums.enrollments import EnrollmentStatus
from app.models.contest import Contest
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.tournament import Tournament
from app.models.tournament_membership import STATUS_PLAYED, TournamentMembership
from app.models.user import User
from app.services.standings import contest_standings
from app.utils.tenant import scoped
from app.utils.timezone import now_ist, to_ist


@dataclass
class RefreshReport:
    slug: str
    members: int  # rows whose numbers were written
    created: int  # rows the inline writes had missed


async def refresh_tournament(tournament: Tournament) -> RefreshReport:
    """Recompute every member's numbers in one tournament.

    teams_count counts the teams they made, contests_count the contests they
    have an active entry in. best_rank is their best leaderboard place in any
    contest, and total_points sums their entry's points across contests: one
    active entry per person per contest, so nothing is counted twice.
    """
    tid = tournament.id
    now = now_ist()

    teams = await (
        scoped(Team, tid)
        .aggregate(
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
        .to_list()
    )
    teams_count = {row["_id"]: row["count"] for row in teams}
    first_team_at = {row["_id"]: row["first"] for row in teams}

    entries = await (
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
        .to_list()
    )
    contests_count = {row["_id"]: len(row["contests"]) for row in entries}

    # Latest team or entry, for rows whose inline write missed it: the profile
    # orders tournaments by it.
    last_active: Dict[PydanticObjectId, datetime] = {}
    for row in teams + entries:
        if row["last"] is not None:
            seen = to_ist(row["last"])
            last_active[row["_id"]] = max(last_active.get(row["_id"], seen), seen)

    best_rank: Dict[PydanticObjectId, int] = {}
    total_points: Dict[PydanticObjectId, float] = defaultdict(float)
    async for contest in scoped(Contest, tid):
        placed = set()
        for rank, (_, user, points) in enumerate(
            await contest_standings(contest.id, tid), start=1
        ):
            if user.id in placed:
                continue
            placed.add(user.id)
            best_rank[user.id] = min(best_rank.get(user.id, rank), rank)
            total_points[user.id] += points

    members = {
        m.user_id: m
        async for m in TournamentMembership.find(
            TournamentMembership.tournament_id == tid
        )
    }

    played = set(teams_count) | set(contests_count)
    missing = played - set(members)
    created = 0
    if missing:
        for user in await User.find(In(User.id, list(missing))).to_list():
            started = first_team_at.get(user.id) or now
            row = TournamentMembership(
                user_id=user.id,
                tournament_id=tid,
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
                    TournamentMembership.tournament_id == tid,
                )
            members[user.id] = row

    writes = []
    for user_id, row in members.items():
        update = {
            "stats": {
                "teams_count": teams_count.get(user_id, 0),
                "contests_count": contests_count.get(user_id, 0),
                "best_rank": best_rank.get(user_id),
                "total_points": total_points.get(user_id, 0.0),
                "refreshed_at": now,
            }
        }
        if user_id in played:
            update["status"] = STATUS_PLAYED
        writes.append(UpdateOne({"_id": row.id}, {"$set": update}))
        if user_id in last_active:
            # Only forward: a later play written inline since this job read
            # is kept. The condition is in the query, so it holds even then.
            latest = last_active[user_id]
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
        if user_id in played and row.first_played_at is None:
            writes.append(
                UpdateOne(
                    {"_id": row.id, "first_played_at": None},
                    {"$set": {"first_played_at": first_team_at.get(user_id) or now}},
                )
            )
    if writes:
        await TournamentMembership.get_motor_collection().bulk_write(
            writes, ordered=False
        )

    return RefreshReport(slug=tournament.slug, members=len(members), created=created)
