from typing import List, Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.contest import Contest
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.user import User
from app.utils.dependencies import get_admin_user

router = APIRouter(prefix="/api/admin", tags=["Admin - Users & Teams"])


@router.get("/users-with-teams")
async def users_with_teams(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search username or full_name"),
    current_user: User = Depends(get_admin_user),
):
    # naive approach: filter users by search, then count teams per user
    q = User.find_all()
    if search:
        from beanie.operators import Or, RegEx

        q = User.find(
            Or(
                RegEx(User.username, search, options="i"),
                RegEx(User.full_name, search, options="i"),
            )
        )
    total = await q.count()
    skip = (page - 1) * page_size
    users = await q.skip(skip).limit(page_size).to_list()

    results = []
    for u in users:
        count = await Team.find(Team.user_id == u.id).count()
        if count > 0:
            results.append(
                {
                    "user_id": str(u.id),
                    "username": u.username,
                    "full_name": u.full_name,
                    "team_count": count,
                }
            )

    return {
        "users": results,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/users/{user_id}/teams")
async def get_user_teams_admin(
    user_id: str,
    contest_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_admin_user),
):
    try:
        uoid = PydanticObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    user = await User.get(uoid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    q = Team.find(Team.user_id == user.id)
    total = await q.count()
    skip = (page - 1) * page_size
    teams = await q.skip(skip).limit(page_size).sort(-Team.created_at).to_list()

    enrollments_map = {}
    if contest_id:
        contest = await Contest.get(contest_id)
        if contest:
            team_ids = [t.id for t in teams]
            if team_ids:
                enrs = await TeamContestEnrollment.find(
                    {
                        "team_id": {"$in": team_ids},
                        "contest_id": contest.id,
                        "status": "active",
                    }
                ).to_list()
                for e in enrs:
                    enrollments_map[str(e.team_id)] = str(e.id)

    return {
        "user": {
            "user_id": str(user.id),
            "username": user.username,
            "full_name": user.full_name,
        },
        "teams": [
            {
                "team_id": str(t.id),
                "team_name": t.team_name,
                "total_points": t.total_points,
                "created_at": t.created_at,
                "enrolled": (
                    bool(enrollments_map.get(str(t.id))) if contest_id else None
                ),
                "enrollment_id": enrollments_map.get(str(t.id)) if contest_id else None,
            }
            for t in teams
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
