from fastapi import APIRouter, Depends, HTTPException, status as http_status, Query, UploadFile, File
from typing import Optional, List
from beanie import PydanticObjectId
from datetime import datetime
from bson import ObjectId
from app.utils.timezone import now_ist, to_ist
from app.utils.gridfs import upload_contest_logo_to_gridfs, delete_contest_logo_from_gridfs
from pydantic import BaseModel

from app.models.contest import Contest
from app.models.team import Team
from app.models.player import Player
from app.models.player_contest_points import PlayerContestPoints
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.common.enums.contests import ContestStatus, ContestVisibility
from app.common.enums.enrollments import EnrollmentStatus
from app.schemas.contest import (
    ContestCreate,
    ContestUpdate,
    ContestResponse,
    ContestListResponse,
)
from app.schemas.enrollment import (
    EnrollmentBulkRequest,
    UnenrollBulkRequest,
    EnrollmentResponse,
)
from app.utils.dependencies import get_admin_user
from app.models.user import User

router = APIRouter(prefix="/api/admin/contests", tags=["Admin - Contests"])

async def to_response(contest: Contest) -> ContestResponse:
    logo_url = contest.logo_url
    if not logo_url and not contest.logo_file_id:
        # Fallback to default tournament logo
        from app.models.settings import GlobalSettings
        settings = await GlobalSettings.get_instance()
        if settings.default_contest_logo_file_id:
            logo_url = "/api/settings/logo"

    return ContestResponse(
        id=str(contest.id),
        code=contest.code,
        name=contest.name,
        description=contest.description,
        logo_url=logo_url,
        logo_file_id=contest.logo_file_id,
        start_at=to_ist(contest.start_at),
        end_at=to_ist(contest.end_at),
        status=contest.status,
        visibility=contest.visibility,
        points_scope=contest.points_scope,
        contest_type=contest.contest_type,
        allowed_teams=contest.allowed_teams or [],
        created_at=to_ist(contest.created_at),
        updated_at=to_ist(contest.updated_at),
    )



@router.post("", response_model=ContestResponse, status_code=201)
async def create_contest(
    data: ContestCreate,
    current_user: User = Depends(get_admin_user),
):
    if data.start_at >= data.end_at:
        raise HTTPException(status_code=400, detail="start_at must be before end_at")

    existing = await Contest.find_one(Contest.code == data.code)
    if existing:
        raise HTTPException(status_code=400, detail="Contest code already exists")

    now = now_ist()
    contest = Contest(
        code=data.code,
        name=data.name,
        description=data.description,
        start_at=data.start_at,
        end_at=data.end_at,
        status=data.status,
        visibility=data.visibility,
        points_scope=data.points_scope,
        contest_type=data.contest_type,
        allowed_teams=data.allowed_teams,
        created_at=now,
        updated_at=now,
    )
    await contest.insert()
    return await to_response(contest)


@router.get("", response_model=ContestListResponse)
async def list_contests(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_admin_user),
):
    query = Contest.find_all()
    if status:
        query = Contest.find(Contest.status == status)
    # Simple search on code or name (case sensitive minimal)
    if search:
        from beanie.operators import Or, RegEx
        conditions = Or(RegEx(Contest.code, search, options="i"), RegEx(Contest.name, search, options="i"))
        query = Contest.find(conditions)

    total = await query.count()
    skip = (page - 1) * page_size
    rows = await query.skip(skip).limit(page_size).sort(-Contest.start_at).to_list()
    return {
        "contests": [await to_response(c) for c in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{contest_id}", response_model=ContestResponse)
async def get_contest(contest_id: str, current_user: User = Depends(get_admin_user)):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    return await to_response(contest)


@router.put("/{contest_id}", response_model=ContestResponse)
async def update_contest(
    contest_id: str,
    data: ContestUpdate,
    current_user: User = Depends(get_admin_user),
):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    update_fields = data.model_dump(exclude_unset=True)

    if "code" in update_fields:
        update_fields.pop("code")  # immutable

    # Validate dates if provided
    new_start = update_fields.get("start_at", contest.start_at)
    new_end = update_fields.get("end_at", contest.end_at)
    if new_start >= new_end:
        raise HTTPException(status_code=400, detail="start_at must be before end_at")

    for k, v in update_fields.items():
        setattr(contest, k, v)
    contest.updated_at = now_ist()
    await contest.save()
    return await to_response(contest)


@router.delete("/{contest_id}")
async def delete_contest(
    contest_id: str,
    force: bool = Query(False),
    current_user: User = Depends(get_admin_user),
):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    active_enrollments = await TeamContestEnrollment.find({
        "contest_id": contest.id,
        "status": EnrollmentStatus.ACTIVE,
    }).count()

    # If there are active enrollments, honor force=true to unenroll and proceed.
    if active_enrollments > 0:
        if force:
            # mark all active enrollments removed
            async for enr in TeamContestEnrollment.find({
                "contest_id": contest.id,
                "status": EnrollmentStatus.ACTIVE,
            }):
                enr.status = EnrollmentStatus.REMOVED
                enr.removed_at = now_ist()
                await enr.save()
        else:
            raise HTTPException(status_code=409, detail="Contest has active enrollments. Use force=true to unenroll and delete.")

    await contest.delete()
    return {"message": "Contest deleted"}


@router.post("/{contest_id}/enroll-teams", response_model=List[EnrollmentResponse])
async def enroll_teams(
    contest_id: str,
    body: EnrollmentBulkRequest,
    current_user: User = Depends(get_admin_user),
):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    if not body.team_ids:
        return []

    created: List[EnrollmentResponse] = []

    for tid in body.team_ids:
        try:
            oid = PydanticObjectId(tid)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid team id: {tid}")
        team = await Team.get(oid)
        if not team:
            raise HTTPException(status_code=404, detail=f"Team not found: {tid}")

        # Ensure no duplicate active enrollment
        existing = await TeamContestEnrollment.find_one(
            (TeamContestEnrollment.team_id == team.id)
            & (TeamContestEnrollment.contest_id == contest.id)
            & (TeamContestEnrollment.status == "active")
        )
        if existing:
            # skip duplicates silently
            continue

        enr = TeamContestEnrollment(
            team_id=team.id,
            user_id=team.user_id,
            contest_id=contest.id,
            status=EnrollmentStatus.ACTIVE,
            enrolled_at=now_ist(),
        )
        await enr.insert()
        # Persist contest_id on the team for convenience
        try:
            team.contest_id = str(contest.id)
            team.updated_at = now_ist()
            await team.save()
        except Exception:
            # Do not fail enrollment if team update fails
            pass
        created.append(
            EnrollmentResponse(
                id=str(enr.id),
                team_id=str(enr.team_id),
                user_id=str(enr.user_id),
                contest_id=str(enr.contest_id),
                status=enr.status,
                enrolled_at=enr.enrolled_at,
                removed_at=enr.removed_at,
            )
        )

    return created


@router.delete("/{contest_id}/enrollments")
async def unenroll(
    contest_id: str,
    body: UnenrollBulkRequest,
    current_user: User = Depends(get_admin_user),
):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    count = 0
    # Collect affected team ids to batch-check for remaining active enrollments
    from typing import Set
    affected_team_ids: Set[PydanticObjectId] = set()

    if body.enrollment_ids:
        for eid in body.enrollment_ids:
            enr = await TeamContestEnrollment.get(eid)
            if enr and enr.contest_id == contest.id and enr.status == "active":
                enr.status = "removed"
                enr.removed_at = now_ist()
                await enr.save()
                count += 1
                affected_team_ids.add(enr.team_id)

    if body.team_ids:
        for tid in body.team_ids:
            try:
                toid = PydanticObjectId(tid)
            except Exception:
                continue
            enr = await TeamContestEnrollment.find_one(
                (TeamContestEnrollment.team_id == toid)
                & (TeamContestEnrollment.contest_id == contest.id)
                & (TeamContestEnrollment.status == EnrollmentStatus.ACTIVE)
            )
            if enr:
                enr.status = EnrollmentStatus.REMOVED
                enr.removed_at = now_ist()
                await enr.save()
                count += 1
                affected_team_ids.add(toid)

    # Batch check and clear team.contest_id for teams with no remaining active enrollments
    if affected_team_ids:
        try:
            # Find teams that still have at least one active enrollment for this contest
            still_active_team_ids: Set[PydanticObjectId] = set()
            async for active in TeamContestEnrollment.find({
                "team_id": {"$in": list(affected_team_ids)},
                "contest_id": contest.id,
                "status": "active",
            }):
                still_active_team_ids.add(active.team_id)

            # Teams to clear = affected - still_active
            to_clear_ids = [tid for tid in affected_team_ids if tid not in still_active_team_ids]
            for tid in to_clear_ids:
                team = await Team.get(tid)
                if team and team.contest_id is not None:
                    team.contest_id = None
                    team.updated_at = now_ist()
                    await team.save()
        except Exception:
            # Best-effort cleanup; ignore errors
            pass

    return {"unenrolled": count}


# -------- Per-Contest Player Points Management --------
from pydantic import BaseModel
from typing import Dict


class PlayerPointsItem(BaseModel):
    player_id: str
    points: float


class PlayerPointsBulkUpsertRequest(BaseModel):
    updates: list[PlayerPointsItem]


class PlayerPointsResponseItem(BaseModel):
    player_id: str
    name: Optional[str] = None
    team: Optional[str] = None
    points: float
    updated_at: datetime


@router.get("/{contest_id}/player-points", response_model=list[PlayerPointsResponseItem])
async def get_player_points(
    contest_id: str,
    current_user: User = Depends(get_admin_user),
):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    docs = await PlayerContestPoints.find({"contest_id": contest.id}).to_list()
    # fetch player details in batch
    pid_set = [doc.player_id for doc in docs]
    players_by_id: Dict[str, Player] = {}
    if pid_set:
        players = await Player.find({"_id": {"$in": pid_set}}).to_list()
        players_by_id = {str(p.id): p for p in players}

    resp: list[PlayerPointsResponseItem] = []
    for doc in docs:
        p = players_by_id.get(str(doc.player_id))
        resp.append(PlayerPointsResponseItem(
            player_id=str(doc.player_id),
            name=(p.name if p else None) if p else None,
            team=(p.team if p else None) if p else None,
            points=float(doc.points or 0.0),
            updated_at=doc.updated_at,
        ))
    return resp


@router.put("/{contest_id}/player-points", response_model=list[PlayerPointsResponseItem])
async def upsert_player_points(
    contest_id: str,
    body: PlayerPointsBulkUpsertRequest,
    current_user: User = Depends(get_admin_user),
):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    if not body.updates:
        return []

    # Validate player ids and build list
    valid_items: list[tuple[PydanticObjectId, float]] = []
    for item in body.updates:
        try:
            poid = PydanticObjectId(item.player_id)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid player id: {item.player_id}")
        valid_items.append((poid, float(item.points)))

    # Upsert
    updated_docs: list[PlayerContestPoints] = []
    now = now_ist()
    for poid, pts in valid_items:
        existing = await PlayerContestPoints.find_one({
            "contest_id": contest.id,
            "player_id": poid,
        })
        if existing:
            existing.points = pts
            existing.updated_at = now
            await existing.save()
            updated_docs.append(existing)
        else:
            doc = PlayerContestPoints(
                contest_id=contest.id,
                player_id=poid,
                points=pts,
                updated_at=now,
            )
            await doc.insert()
            updated_docs.append(doc)

    # Build response with player details
    pid_set = [doc.player_id for doc in updated_docs]
    players_by_id: Dict[str, Player] = {}
    if pid_set:
        players = await Player.find({"_id": {"$in": pid_set}}).to_list()
        players_by_id = {str(p.id): p for p in players}

    resp: list[PlayerPointsResponseItem] = []
    for doc in updated_docs:
        p = players_by_id.get(str(doc.player_id))
        resp.append(PlayerPointsResponseItem(
            player_id=str(doc.player_id),
            name=(p.name if p else None) if p else None,
            team=(p.team if p else None) if p else None,
            points=float(doc.points or 0.0),
            updated_at=doc.updated_at,
        ))
    # If this is a full contest (not daily), mirror these points into Player.points
    try:
        if contest.contest_type != "daily" and updated_docs:
            # Batch update players so that Player.points equals the contest total for this contest
            for doc in updated_docs:
                try:
                    player = await Player.get(doc.player_id)
                    if player:
                        player.points = float(doc.points or 0.0)
                        player.updated_at = now_ist()
                        await player.save()
                except Exception:
                    # continue best-effort for each player, do not fail the response
                    continue
    except Exception:
        # Non-blocking
        pass

    return resp


# -------- Per-Contest Logo Management --------


class UploadResponse(BaseModel):
    url: str
    message: str

@router.post("/{contest_id}/upload-logo", response_model=UploadResponse)
async def upload_contest_logo(
    contest_id: str,
    file: UploadFile = File(..., description="Contest logo image"),
    current_user: User = Depends(get_admin_user),
):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    # Delete old logo if it exists in GridFS
    if contest.logo_file_id:
        await delete_contest_logo_from_gridfs(contest.logo_file_id)

    # Save new logo to GridFS
    try:
        file_id = await upload_contest_logo_to_gridfs(file, filename_prefix=f"contest_{contest_id}")
        # Update contest with API URL and file id
        contest.logo_file_id = file_id
        contest.logo_url = f"/api/contests/{contest_id}/logo"
        contest.updated_at = now_ist()
        await contest.save()
        return UploadResponse(
            url=contest.logo_url,
            message="Logo uploaded successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload logo: {str(e)}"
        )

