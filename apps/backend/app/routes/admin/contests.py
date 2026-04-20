from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    UploadFile,
    File,
)
from fastapi.responses import StreamingResponse
from typing import Optional, List, Dict
from beanie import PydanticObjectId
from datetime import datetime
from io import BytesIO
from bson import ObjectId
from pymongo.errors import DuplicateKeyError, PyMongoError
from app.utils.timezone import now_ist, to_ist
from app.utils.gridfs import (
    upload_contest_logo_to_gridfs,
    delete_contest_logo_from_gridfs,
)
from pydantic import BaseModel
from openpyxl import Workbook

from app.models.contest import Contest
from app.models.team import Team
from app.models.player import Player
from app.models.player_contest_points import PlayerContestPoints
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.common.enums.contests import (
    ContestType,
    ContestStatus,
    ContestVisibility,
    PointsScope,
)
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
    _current_user: User = Depends(get_admin_user),
):
    if data.start_at >= data.end_at:
        raise HTTPException(status_code=400, detail="start_at must be before end_at")

    existing = await Contest.find_one(Contest.code == data.code)
    if existing:
        raise HTTPException(status_code=400, detail="Contest code already exists")

    now = now_ist()
    status = ContestStatus(data.status)
    visibility = ContestVisibility(data.visibility)
    points_scope = PointsScope(data.points_scope)
    contest_type = ContestType(data.contest_type)
    contest = Contest(
        code=data.code,
        name=data.name,
        description=data.description,
        start_at=data.start_at,
        end_at=data.end_at,
        status=status,
        visibility=visibility,
        points_scope=points_scope,
        contest_type=contest_type,
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
    status: Optional[ContestStatus] = Query(None),
    search: Optional[str] = Query(None),
    _current_user: User = Depends(get_admin_user),
):
    query = Contest.find_all()
    if status:
        query = Contest.find(Contest.status == status)

    if search:
        from beanie.operators import Or, RegEx

        conditions = Or(
            RegEx(Contest.code, search, options="i"),
            RegEx(Contest.name, search, options="i"),
        )
        query = Contest.find(conditions)

    total = await query.count()
    skip = (page - 1) * page_size
    rows = await query.skip(skip).limit(page_size).sort("-start_at").to_list()
    return {
        "contests": [await to_response(c) for c in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{contest_id}", response_model=ContestResponse)
async def get_contest(contest_id: str, _current_user: User = Depends(get_admin_user)):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    return await to_response(contest)


@router.put("/{contest_id}", response_model=ContestResponse)
async def update_contest(
    contest_id: str,
    data: ContestUpdate,
    _current_user: User = Depends(get_admin_user),
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
    _current_user: User = Depends(get_admin_user),
):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    active_enrollments = await TeamContestEnrollment.find(
        {
            "contest_id": contest.id,
            "status": EnrollmentStatus.ACTIVE,
        }
    ).count()

    # If there are active enrollments, honor force=true to unenroll and proceed.
    if active_enrollments > 0:
        if force:
            # mark all active enrollments removed
            async for enr in TeamContestEnrollment.find(
                {
                    "contest_id": contest.id,
                    "status": EnrollmentStatus.ACTIVE,
                }
            ):
                enr.status = EnrollmentStatus.REMOVED
                enr.removed_at = now_ist()
                await enr.save()
        else:
            raise HTTPException(
                status_code=409,
                detail="Contest has active enrollments. Use force=true to unenroll and delete.",
            )

    await contest.delete()
    return {"message": "Contest deleted"}


@router.post("/{contest_id}/enroll-teams", response_model=List[EnrollmentResponse])
async def enroll_teams(
    contest_id: str,
    body: EnrollmentBulkRequest,
    _current_user: User = Depends(get_admin_user),
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
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400, detail=f"Invalid team id: {tid}"
            ) from exc
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

        existing_for_user = await TeamContestEnrollment.find_one(
            (TeamContestEnrollment.user_id == team.user_id)
            & (TeamContestEnrollment.contest_id == contest.id)
            & (TeamContestEnrollment.status == EnrollmentStatus.ACTIVE)
        )
        if existing_for_user:
            # one active team per user per contest
            continue

        if team.id is None or contest.id is None:
            raise HTTPException(status_code=500, detail="Invalid team/contest id state")

        enr = TeamContestEnrollment(
            team_id=team.id,
            user_id=team.user_id,
            contest_id=contest.id,
            status=EnrollmentStatus.ACTIVE,
            enrolled_at=now_ist(),
        )
        try:
            await enr.insert()
        except DuplicateKeyError:
            # race safety: unique active (contest_id, user_id) guard
            continue
        # Persist contest_id on the team for convenience
        try:
            team.contest_id = str(contest.id)
            team.updated_at = now_ist()
            await team.save()
        except PyMongoError:
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
    _current_user: User = Depends(get_admin_user),
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
                enr.status = EnrollmentStatus.REMOVED
                enr.removed_at = now_ist()
                await enr.save()
                count += 1
                affected_team_ids.add(enr.team_id)

    if body.team_ids:
        for tid in body.team_ids:
            try:
                toid = PydanticObjectId(tid)
            except (TypeError, ValueError):
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
            async for active in TeamContestEnrollment.find(
                {
                    "team_id": {"$in": list(affected_team_ids)},
                    "contest_id": contest.id,
                    "status": "active",
                }
            ):
                still_active_team_ids.add(active.team_id)

            # Teams to clear = affected - still_active
            to_clear_ids = [
                tid for tid in affected_team_ids if tid not in still_active_team_ids
            ]
            for tid in to_clear_ids:
                team = await Team.get(tid)
                if team and team.contest_id is not None:
                    team.contest_id = None
                    team.updated_at = now_ist()
                    await team.save()
        except PyMongoError:
            # Best-effort cleanup; ignore errors
            pass

    return {"unenrolled": count}


# -------- Per-Contest Player Points Management --------


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


@router.get(
    "/{contest_id}/player-points", response_model=list[PlayerPointsResponseItem]
)
async def get_player_points(
    contest_id: str,
    _current_user: User = Depends(get_admin_user),
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
        resp.append(
            PlayerPointsResponseItem(
                player_id=str(doc.player_id),
                name=(p.name if p else None) if p else None,
                team=(p.team if p else None) if p else None,
                points=float(doc.points or 0.0),
                updated_at=doc.updated_at,
            )
        )
    return resp


@router.put(
    "/{contest_id}/player-points", response_model=list[PlayerPointsResponseItem]
)
async def upsert_player_points(
    contest_id: str,
    body: PlayerPointsBulkUpsertRequest,
    _current_user: User = Depends(get_admin_user),
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
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400, detail=f"Invalid player id: {item.player_id}"
            ) from exc
        valid_items.append((poid, float(item.points)))

    # Upsert
    updated_docs: list[PlayerContestPoints] = []
    now = now_ist()
    for poid, pts in valid_items:
        existing = await PlayerContestPoints.find_one(
            {
                "contest_id": contest.id,
                "player_id": poid,
            }
        )
        if existing:
            existing.points = pts
            existing.updated_at = now
            await existing.save()
            updated_docs.append(existing)
        else:
            if contest.id is None:
                raise HTTPException(status_code=500, detail="Invalid contest id state")
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
        resp.append(
            PlayerPointsResponseItem(
                player_id=str(doc.player_id),
                name=(p.name if p else None) if p else None,
                team=(p.team if p else None) if p else None,
                points=float(doc.points or 0.0),
                updated_at=doc.updated_at,
            )
        )
    # If this is a full contest (not daily), mirror these points into Player.points
    if contest.contest_type != "daily" and updated_docs:
        # Batch update players so that Player.points equals the contest total for this contest
        for doc in updated_docs:
            try:
                player = await Player.get(doc.player_id)
                if player:
                    player.points = float(doc.points or 0.0)
                    player.updated_at = now_ist()
                    await player.save()
            except PyMongoError:
                # continue best-effort for each player, do not fail the response
                continue

    return resp


# -------- Per-Contest Logo Management --------


class UploadResponse(BaseModel):
    url: str
    message: str


@router.post("/{contest_id}/upload-logo", response_model=UploadResponse)
async def upload_contest_logo(
    contest_id: str,
    file: UploadFile = File(..., description="Contest logo image"),
    _current_user: User = Depends(get_admin_user),
):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    # Delete old logo if it exists in GridFS
    if contest.logo_file_id:
        await delete_contest_logo_from_gridfs(contest.logo_file_id)

    # Save new logo to GridFS
    try:
        file_id = await upload_contest_logo_to_gridfs(
            file, filename_prefix=f"contest_{contest_id}"
        )
        # Update contest with API URL and file id
        contest.logo_file_id = file_id
        contest.logo_url = f"/api/contests/{contest_id}/logo"
        contest.updated_at = now_ist()
        await contest.save()
        return UploadResponse(
            url=contest.logo_url, message="Logo uploaded successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to upload logo: {str(e)}"
        ) from e


@router.get("/{contest_id}/leaderboard/export")
async def export_contest_leaderboard_excel(
    contest_id: str,
    _current_user: User = Depends(get_admin_user),
):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    enrollments = await TeamContestEnrollment.find(
        {
            "contest_id": contest.id,
            "status": EnrollmentStatus.ACTIVE,
        }
    ).to_list()

    team_ids = [enr.team_id for enr in enrollments]
    teams = await Team.find({"_id": {"$in": team_ids}}).to_list() if team_ids else []
    teams_by_id = {str(t.id): t for t in teams}

    user_ids = list({t.user_id for t in teams})
    users = await User.find({"_id": {"$in": user_ids}}).to_list() if user_ids else []
    users_by_id = {str(u.id): u for u in users}

    all_player_ids: set[PydanticObjectId] = set()
    team_player_oids_map: dict[str, list[PydanticObjectId]] = {}
    for enr in enrollments:
        team = teams_by_id.get(str(enr.team_id))
        if not team:
            continue
        oids: list[PydanticObjectId] = []
        for pid in team.player_ids:
            if ObjectId.is_valid(pid):
                try:
                    poid = PydanticObjectId(pid)
                except (TypeError, ValueError):
                    continue
                oids.append(poid)
                all_player_ids.add(poid)
        team_player_oids_map[str(enr.team_id)] = oids

    pcp_docs = []
    if all_player_ids:
        pcp_docs = await PlayerContestPoints.find(
            {
                "contest_id": contest.id,
                "player_id": {"$in": list(all_player_ids)},
            }
        ).to_list()
    pcp_points_map = {str(doc.player_id): float(doc.points or 0.0) for doc in pcp_docs}

    players_by_id: dict[str, Player] = {}
    if all_player_ids:
        player_docs = await Player.find(
            {"_id": {"$in": list(all_player_ids)}}
        ).to_list()
        players_by_id = {str(p.id): p for p in player_docs}

    computed_rows: list[dict] = []
    for enr in enrollments:
        team = teams_by_id.get(str(enr.team_id))
        if not team:
            continue
        user = users_by_id.get(str(team.user_id))
        if not user:
            continue

        oids = team_player_oids_map.get(str(enr.team_id), [])
        captain_id = str(team.captain_id) if team.captain_id else None
        vice_id = str(team.vice_captain_id) if team.vice_captain_id else None

        total_points = 0.0
        selected_player_names: list[str] = []
        for oid in oids:
            pid = str(oid)
            points = float(pcp_points_map.get(pid, 0.0))
            if captain_id and pid == captain_id:
                points *= 2.0
            elif vice_id and pid == vice_id:
                points *= 1.5
            total_points += points

            p = players_by_id.get(pid)
            selected_player_names.append(p.name if p else pid)

        captain_player = players_by_id.get(captain_id) if captain_id else None
        vice_captain_player = players_by_id.get(vice_id) if vice_id else None
        captain_name = captain_player.name if captain_player else ""
        vice_captain_name = vice_captain_player.name if vice_captain_player else ""

        computed_rows.append(
            {
                "team_name": team.team_name,
                "points": float(total_points),
                "username": user.username,
                "full_name": user.full_name or "",
                "email": str(user.email) if user.email else "",
                "mobile": user.mobile or "",
                "captain_name": captain_name,
                "vice_captain_name": vice_captain_name,
                "selected_players": ", ".join(selected_player_names),
            }
        )

    computed_rows.sort(key=lambda row: row["points"], reverse=True)

    wb = Workbook()
    ws = wb.active
    if ws is None:
        raise HTTPException(status_code=500, detail="Failed to initialize workbook")
    ws.title = "Leaderboard"

    ws.append(
        [
            "Contest ID",
            "Contest Code",
            "Contest Name",
            "Rank",
            "Team Name",
            "Points",
            "Username",
            "Name",
            "Email",
            "Number",
            "Captain",
            "Vice Captain",
            "Selected Players",
        ]
    )

    for idx, row in enumerate(computed_rows, start=1):
        ws.append(
            [
                str(contest.id),
                contest.code,
                contest.name,
                idx,
                row["team_name"],
                round(row["points"], 2),
                row["username"],
                row["full_name"],
                row["email"],
                row["mobile"],
                row["captain_name"],
                row["vice_captain_name"],
                row["selected_players"],
            ]
        )

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    safe_code = (contest.code or "contest").replace(" ", "_")
    filename = (
        f"leaderboard_{safe_code}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    )

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
