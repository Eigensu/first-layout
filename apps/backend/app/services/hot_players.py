from __future__ import annotations

from typing import Any, Dict, List, Optional

from beanie import PydanticObjectId

from app.common.enums.enrollments import EnrollmentStatus
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.utils.tenant import TenantId, scoped, tenant_filter


async def count_global(player_id: str, *, tournament_id: TenantId) -> int:
    """Count how many of this tournament's Team documents include the player."""
    # player_ids is a list of string ObjectIds in Team
    return (
        await scoped(Team, tournament_id).find({"player_ids": str(player_id)}).count()
    )


async def count_in_contest(
    player_id: str, contest_id: str, *, tournament_id: TenantId
) -> int:
    """Count how many unique Team documents include the player within a specific contest.

    A team is considered only if it is actively enrolled in the given contest.
    """
    try:
        contest_oid = PydanticObjectId(contest_id)
    except Exception:
        return 0

    # Whole documents: this was .project(TeamContestEnrollment.team_id), but
    # Beanie projects onto a model class, not a field, and raised TypeError --
    # so every per-contest count was a 500.
    enrollments = (
        await scoped(TeamContestEnrollment, tournament_id)
        .find(
            {
                "contest_id": contest_oid,
                "status": EnrollmentStatus.ACTIVE,
            }
        )
        .to_list()
    )

    if not enrollments:
        return 0

    team_ids = list({enr.team_id for enr in enrollments if enr.team_id})
    return (
        await scoped(Team, tournament_id)
        .find(
            {
                "_id": {"$in": team_ids},
                "player_ids": str(player_id),
            }
        )
        .count()
    )


async def aggregate_hot_global(
    skip: int = 0, limit: int = 200, *, tournament_id: TenantId
) -> List[Dict[str, Any]]:
    """Aggregate hotness counts for all players across this tournament's teams.

    Returns list of documents: {"_id": player_id_str, "selection_count": int}
    sorted by selection_count desc.
    """
    coll = Team.get_motor_collection()
    pipeline = [
        {"$match": tenant_filter(tournament_id)},
        {"$unwind": "$player_ids"},
        {"$group": {"_id": "$player_ids", "selection_count": {"$sum": 1}}},
        {"$sort": {"selection_count": -1}},
        {"$skip": max(0, int(skip))},
        {"$limit": max(0, int(limit))},
    ]
    return await coll.aggregate(pipeline).to_list(length=limit)


async def aggregate_hot_in_contest(
    contest_id: str, skip: int = 0, limit: int = 200, *, tournament_id: TenantId
) -> List[Dict[str, Any]]:
    """Aggregate contest-specific hotness counts for all players in a contest.

    Returns list of documents: {"_id": player_id_str, "selection_count": int}
    sorted by selection_count desc.
    """
    try:
        contest_oid = PydanticObjectId(contest_id)
    except Exception:
        return []

    enr_coll = TeamContestEnrollment.get_motor_collection()
    team_collection_name = Team.get_motor_collection().name
    pipeline = [
        {
            "$match": {
                **tenant_filter(tournament_id),
                "contest_id": contest_oid,
                "status": EnrollmentStatus.ACTIVE,
            }
        },
        {
            "$lookup": {
                "from": team_collection_name,
                "localField": "team_id",
                "foreignField": "_id",
                "as": "team",
            }
        },
        {"$unwind": "$team"},
        {"$unwind": "$team.player_ids"},
        {"$group": {"_id": "$team.player_ids", "selection_count": {"$sum": 1}}},
        {"$sort": {"selection_count": -1}},
        {"$skip": max(0, int(skip))},
        {"$limit": max(0, int(limit))},
    ]
    return await enr_coll.aggregate(pipeline).to_list(length=limit)
