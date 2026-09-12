from __future__ import annotations

from typing import Any, Dict, List, Optional

from beanie import PydanticObjectId

from app.common.enums.enrollments import EnrollmentStatus
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment


async def count_global(player_id: str) -> int:
    """Count how many unique Team documents include the given player globally."""
    # player_ids is a list of string ObjectIds in Team
    return await Team.find({"player_ids": str(player_id)}).count()


async def count_in_contest(player_id: str, contest_id: str) -> int:
    """Count how many unique Team documents include the player within a specific contest.

    A team is considered only if it is actively enrolled in the given contest.
    """
    try:
        contest_oid = PydanticObjectId(contest_id)
    except Exception:
        return 0

    enrollments = (
        await TeamContestEnrollment.find(
            {
                "contest_id": contest_oid,
                "status": EnrollmentStatus.ACTIVE,
            }
        )
        .project(TeamContestEnrollment.team_id)
        .to_list()
    )

    if not enrollments:
        return 0

    team_ids = list({enr.team_id for enr in enrollments if enr.team_id})
    return await Team.find(
        {
            "_id": {"$in": team_ids},
            "player_ids": str(player_id),
        }
    ).count()


async def aggregate_hot_global(skip: int = 0, limit: int = 200) -> List[Dict[str, Any]]:
    """Aggregate global hotness counts for all players.

    Returns list of documents: {"_id": player_id_str, "selection_count": int}
    sorted by selection_count desc.
    """
    coll = Team.get_motor_collection()
    pipeline = [
        {"$unwind": "$player_ids"},
        {"$group": {"_id": "$player_ids", "selection_count": {"$sum": 1}}},
        {"$sort": {"selection_count": -1}},
        {"$skip": max(0, int(skip))},
        {"$limit": max(0, int(limit))},
    ]
    return await coll.aggregate(pipeline).to_list(length=limit)


async def aggregate_hot_in_contest(
    contest_id: str, skip: int = 0, limit: int = 200
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
        {"$match": {"contest_id": contest_oid, "status": EnrollmentStatus.ACTIVE}},
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
