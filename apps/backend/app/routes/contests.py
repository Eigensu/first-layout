from fastapi import APIRouter, Depends, HTTPException, status, Query, Header, Response
from typing import Optional, List, Dict, Annotated
from beanie import PydanticObjectId
from beanie.operators import Or, RegEx
from datetime import datetime
from pydantic import BaseModel
from bson import ObjectId
from app.utils.timezone import now_ist, to_ist
from app.utils.gridfs import open_contest_logo_stream

from app.models.contest import Contest
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.team import Team
from app.models.user import User
from app.models.player import Player
from app.models.player_contest_points import PlayerContestPoints
from app.utils.security import decode_token
from app.schemas.contest import ContestListResponse, ContestResponse
from app.schemas.leaderboard import LeaderboardResponseSchema, LeaderboardEntrySchema
from app.utils.dependencies import get_current_active_user
from app.schemas.enrollment import EnrollmentResponse
from app.common.enums.contests import ContestVisibility, ContestStatus
from app.common.enums.enrollments import EnrollmentStatus

router = APIRouter(prefix="/api/contests", tags=["contests"])

class EnrollRequest(BaseModel):
    team_id: str

class ContestTeamPlayerSchema(BaseModel):
    id: str
    name: str
    team: Optional[str] = None
    price: float = 0.0
    base_points: float = 0.0
    contest_points: float = 0.0
    slot: Optional[str] = None

class ContestTeamResponse(BaseModel):
    team_id: str
    team_name: str
    contest_id: str
    base_points: float
    contest_points: float
    captain_id: Optional[str] = None
    vice_captain_id: Optional[str] = None
    players: List[ContestTeamPlayerSchema]

def _compute_status(contest: Contest) -> ContestStatus:
    now = now_ist()
    # Ensure contest times are in IST for comparison
    start = to_ist(contest.start_at)
    end = to_ist(contest.end_at)
    if end <= now:
        return ContestStatus.COMPLETED
    if start <= now < end:
        return ContestStatus.ONGOING
    return ContestStatus.LIVE


async def to_contest_response(contest: Contest, skip_save: bool = False) -> ContestResponse:
    # Derive status from time window to reflect real-time lifecycle
    computed = _compute_status(contest)
    # Update in-memory status without persisting (saves go to DB asynchronously)
    if contest.status != computed and contest.status != ContestStatus.ARCHIVED:
        contest.status = computed
        contest.updated_at = now_ist()
        # Skip immediate save for performance; status updates are idempotent
        # and will be persisted on next write operation or background task
    logo_url = contest.logo_url
    if not logo_url and not contest.logo_file_id:
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
        status=computed,
        visibility=contest.visibility,
        points_scope=contest.points_scope,
        contest_type=contest.contest_type,
        allowed_teams=contest.allowed_teams or [],
        created_at=to_ist(contest.created_at),
        updated_at=to_ist(contest.updated_at),
    )


async def get_optional_current_user(authorization: Optional[str] = Header(None)) -> Optional[User]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "")
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if payload is None:
        return None
    username = payload.get("sub")
    if not username or not isinstance(username, str):
        return None
    user = await User.find_one(User.username == username)
    return user


@router.get("", response_model=ContestListResponse)
async def list_public_contests(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
    status: Annotated[ContestStatus | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
):
    conditions = [Contest.visibility == ContestVisibility.PUBLIC]

    # Map status to filter clauses
    now = now_ist()
    status_filters = {
        ContestStatus.ONGOING: [Contest.start_at <= now, Contest.end_at > now],
        ContestStatus.LIVE: [Contest.start_at > now],
        ContestStatus.COMPLETED: [Contest.end_at <= now],
        ContestStatus.ARCHIVED: [Contest.status == ContestStatus.ARCHIVED],
    }
    if status:
        conditions.extend(status_filters[status])

    query = Contest.find(conditions[0]) if conditions else Contest.find_all()
    for cond in conditions[1:]:
        query = query.find(cond)

    if q:
        # Text search on code or name, then re-apply filters
        query = Contest.find(Or(RegEx(Contest.code, q, options="i"), RegEx(Contest.name, q, options="i")))
        for cond in conditions:
            query = query.find(cond)

    total = await query.count()
    skip = (page - 1) * page_size
    rows = await query.skip(skip).limit(page_size).sort("-start_at").to_list()

    # Convert to responses with computed status
    items = [await to_contest_response(c) for c in rows]
    return {
        "contests": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/enrollments/me", response_model=List[EnrollmentResponse])
async def list_my_enrollments(current_user: User = Depends(get_current_active_user)):
    """Return active contest enrollments for the authenticated user."""
    enrollments = await TeamContestEnrollment.find({
        "user_id": current_user.id,
        "status": "active",
    }).to_list()

    results: List[EnrollmentResponse] = []
    for enr in enrollments:
        results.append(EnrollmentResponse(
            id=str(enr.id),
            team_id=str(enr.team_id),
            user_id=str(enr.user_id),
            contest_id=str(enr.contest_id),
            status=enr.status,
            enrolled_at=enr.enrolled_at,
            removed_at=enr.removed_at,
        ))
    return results


@router.get("/{contest_id}", response_model=ContestResponse)
async def get_public_contest(contest_id: str):
    contest = await Contest.get(contest_id)
    if not contest or contest.visibility != ContestVisibility.PUBLIC:
        raise HTTPException(status_code=404, detail="Contest not found")
    return await to_contest_response(contest)


@router.get("/{contest_id}/me", response_model=ContestResponse)
async def get_contest_if_enrolled(contest_id: str, current_user: User = Depends(get_current_active_user)):
    """Return contest details if it's public OR the current user is enrolled (active)."""
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if contest.visibility == ContestVisibility.PUBLIC:
        return await to_contest_response(contest)
    # Check enrollment for private contests
    enr = await TeamContestEnrollment.find_one({
        "contest_id": contest.id,
        "user_id": current_user.id,
        "status": EnrollmentStatus.ACTIVE,
    })
    if not enr:
        raise HTTPException(status_code=404, detail="Contest not found")
    return await to_contest_response(contest)


@router.get("/{contest_id}/leaderboard", response_model=LeaderboardResponseSchema)
async def contest_leaderboard(
    contest_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    contest = await Contest.get(contest_id)
    if not contest or contest.visibility != ContestVisibility.PUBLIC:
        raise HTTPException(status_code=404, detail="Contest not found")

    # fetch active enrollments
    enrollments = await TeamContestEnrollment.find({
        "contest_id": contest.id,
        "status": EnrollmentStatus.ACTIVE,
    }).to_list()

    if not enrollments:
        return LeaderboardResponseSchema(entries=[], currentUserEntry=None)

    team_ids = [enr.team_id for enr in enrollments]

    # fetch teams in batch
    teams = await Team.find({"_id": {"$in": team_ids}}).to_list()
    teams_by_id: Dict[str, Team] = {str(t.id): t for t in teams}

    # fetch users in batch
    user_ids = list({t.user_id for t in teams})
    users = await User.find({"_id": {"$in": user_ids}}).to_list()
    users_by_id: Dict[str, User] = {str(u.id): u for u in users}

    # compute points and build entries using per-contest player points
    # 1) Collect all player ObjectIds across enrolled teams
    from bson import ObjectId as _OID
    all_player_ids: set[PydanticObjectId] = set()
    team_player_oids_map: Dict[str, list[PydanticObjectId]] = {}
    for enr in enrollments:
        team = teams_by_id.get(str(enr.team_id))
        if not team:
            continue
        oids: list[PydanticObjectId] = []
        for pid in team.player_ids:
            if _OID.is_valid(pid):
                try:
                    oids.append(PydanticObjectId(pid))
                except Exception:
                    continue
        team_player_oids_map[str(enr.team_id)] = oids
        all_player_ids.update(oids)

    # 2) Fetch all PlayerContestPoints for this contest once
    pcp_docs = []
    if all_player_ids:
        pcp_docs = await PlayerContestPoints.find({
            "contest_id": contest.id,
            "player_id": {"$in": list(all_player_ids)},
        }).to_list()

    # 3) Build lookup: player_id(str) -> points(float)
    pcp_points_map: Dict[str, float] = {str(doc.player_id): float(doc.points or 0.0) for doc in pcp_docs}

    # 4) Sum per team and build computed list (apply C/VC multipliers)
    computed = []
    for enr in enrollments:
        team = teams_by_id.get(str(enr.team_id))
        if not team:
            continue
        user = users_by_id.get(str(team.user_id))
        if not user:
            continue
        oids = team_player_oids_map.get(str(enr.team_id), [])
        # Sum using string form to match map keys, with captain/vice multipliers
        total = 0.0
        captain_id = str(team.captain_id) if team.captain_id else None
        vice_id = str(team.vice_captain_id) if team.vice_captain_id else None
        for oid in oids:
            pid = str(oid)
            base = float(pcp_points_map.get(pid, 0.0))
            if captain_id and pid == captain_id:
                base *= 2.0
            elif vice_id and pid == vice_id:
                base *= 1.5
            total += base
        points = float(total)
        computed.append((team, user, float(points)))

    # sort by points desc
    computed.sort(key=lambda tup: tup[2], reverse=True)

    # pagination
    sliced = computed[skip: skip + limit]

    entries: List[LeaderboardEntrySchema] = []
    current_user_entry: Optional[LeaderboardEntrySchema] = None

    for idx, (team, user, points) in enumerate(sliced, start=skip + 1):
        entry = LeaderboardEntrySchema(
            rank=idx,
            username=user.username,
            displayName=user.full_name or user.username,
            teamName=team.team_name,
            points=points,
            rankChange=team.rank_change,
            avatarUrl=user.avatar_url if hasattr(user, "avatar_url") else None,
            teamId=str(team.id),
        )
        entries.append(entry)

    if current_user:
        # find current user's best-ranked team entry within this contest
        for rank_idx, (team, user, points) in enumerate(computed, start=1):
            if str(user.id) == str(current_user.id):
                current_user_entry = LeaderboardEntrySchema(
                    rank=rank_idx,
                    username=user.username,
                    displayName=user.full_name or user.username,
                    teamName=team.team_name,
                    points=points,
                    rankChange=team.rank_change,
                    avatarUrl=user.avatar_url if hasattr(user, "avatar_url") else None,
                    teamId=str(team.id),
                )
                break

    return LeaderboardResponseSchema(entries=entries, currentUserEntry=current_user_entry)

@router.post("/{contest_id}/enroll", response_model=EnrollmentResponse)
async def enroll_in_contest(
    contest_id: str,
    body: EnrollRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Enroll the authenticated user's team into a public contest.

    Rules:
    - Contest must exist and be public
    - Contest status cannot be completed/archived
    - Team must belong to the current user
    - Idempotent: if already enrolled and active, return existing enrollment
    """
    contest = await Contest.get(contest_id)
    if not contest or contest.visibility != "public":
        raise HTTPException(status_code=404, detail="Contest not found")

    if contest.status in ("completed", "archived"):
        raise HTTPException(status_code=400, detail="Contest is not open for enrollment")

    # validate team ownership (avoid exceptions for validation)
    if not ObjectId.is_valid(body.team_id):
        raise HTTPException(status_code=400, detail="Invalid team id")
    tid = PydanticObjectId(body.team_id)

    team = await Team.get(tid)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Only allow non-owners to view when contest is ONGOING
    computed_status = _compute_status(contest)
    is_owner = current_user is not None and str(team.user_id) == str(current_user.id)
    if not is_owner and computed_status != ContestStatus.ONGOING:
        raise HTTPException(status_code=403, detail="Team details visible when contest is ongoing")

    # If daily contest with restrictions: validate team players belong to allowed teams
    if contest.contest_type == "daily" and contest.allowed_teams:
        # Load players of the team and ensure their real-world team is allowed
        from bson import ObjectId as _OID
        pid_oids = [PydanticObjectId(pid) for pid in team.player_ids if _OID.is_valid(pid)]
        if pid_oids:
            player_docs = await Player.find({"_id": {"$in": pid_oids}}).to_list()
            disallowed = [p.name for p in player_docs if p.team and p.team not in contest.allowed_teams]
            if disallowed:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": "Team contains players from disallowed teams for this daily contest",
                        "disallowed_players": disallowed,
                        "allowed_teams": contest.allowed_teams,
                    },
                )

    # Idempotent check
    existing = await TeamContestEnrollment.find_one({
        "team_id": team.id,
        "contest_id": contest.id,
        "status": EnrollmentStatus.ACTIVE,
    })
    if existing:
        return EnrollmentResponse(
            id=str(existing.id),
            team_id=str(existing.team_id),
            user_id=str(existing.user_id),
            contest_id=str(existing.contest_id),
            status=existing.status,
            enrolled_at=existing.enrolled_at,
            removed_at=existing.removed_at,
        )

    # Create enrollment without baseline fields (points will be contest-scoped)
    assert team.id is not None, "Team ID should not be None"
    assert contest.id is not None, "Contest ID should not be None"
    assert current_user.id is not None, "User ID should not be None"
    enr = TeamContestEnrollment(
        team_id=team.id,
        contest_id=contest.id,
        user_id=current_user.id,
        status=EnrollmentStatus.ACTIVE,
        enrolled_at=now_ist(),
    )
    await enr.insert()  # type: ignore

    return EnrollmentResponse(
        id=str(enr.id),
        team_id=str(enr.team_id),
        user_id=str(enr.user_id),
        contest_id=str(enr.contest_id),
        status=enr.status,
        enrolled_at=enr.enrolled_at,
        removed_at=enr.removed_at,
    )


@router.get("/{contest_id}/teams/{team_id}", response_model=ContestTeamResponse)
async def get_team_in_contest(contest_id: str, team_id: str, current_user: Optional[User] = Depends(get_optional_current_user)):
    contest = await Contest.get(contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    try:
        team = await Team.get(PydanticObjectId(team_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Team not found")
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Allow team owner anytime; others only when contest is ONGOING or COMPLETED
    computed_status = _compute_status(contest)
    is_owner = current_user is not None and str(team.user_id) == str(current_user.id)
    if not is_owner and computed_status not in (ContestStatus.ONGOING, ContestStatus.COMPLETED):
        raise HTTPException(status_code=403, detail="Team details visible when contest is ongoing or completed")

    enr = await TeamContestEnrollment.find_one({
        "team_id": team.id,
        "contest_id": contest.id,
        "status": EnrollmentStatus.ACTIVE,
    })
    if not enr:
        raise HTTPException(status_code=404, detail="Team is not enrolled in this contest")

    # Load players for price/name/team details
    player_ids_valid = [PydanticObjectId(pid) for pid in team.player_ids if ObjectId.is_valid(pid)]
    players = await Player.find({"_id": {"$in": player_ids_valid}}).to_list()

    players_by_id: Dict[str, Player] = {str(p.id): p for p in players}

    # Fetch per-contest points for these players
    pcp_docs = []
    if player_ids_valid:
        pcp_docs = await PlayerContestPoints.find({
            "contest_id": contest.id,
            "player_id": {"$in": player_ids_valid},
        }).to_list()
    pcp_points_map: Dict[str, float] = {str(doc.player_id): float(doc.points or 0.0) for doc in pcp_docs}

    player_items: List[ContestTeamPlayerSchema] = []
    captain_id = str(team.captain_id) if team.captain_id else None
    vice_id = str(team.vice_captain_id) if team.vice_captain_id else None
    for pid in team.player_ids:
        p = players_by_id.get(pid)
        if not p:
            continue
        # Apply multipliers for this player's contest points if C/VC
        contest_pts = float(pcp_points_map.get(pid, 0.0))
        if captain_id and pid == captain_id:
            contest_pts *= 2.0
        elif vice_id and pid == vice_id:
            contest_pts *= 1.5
        player_items.append(ContestTeamPlayerSchema(
            id=pid,
            name=p.name,
            team=p.team,
            price=float(p.price or 0.0),
            base_points=0.0,
            contest_points=contest_pts,
            slot=p.slot,
        ))

    team_points = float(sum(item.contest_points for item in player_items))

    return ContestTeamResponse(
        team_id=str(team.id),
        team_name=team.team_name,
        contest_id=str(contest.id),
        base_points=0.0,
        contest_points=team_points,
        captain_id=str(team.captain_id) if team.captain_id else None,
        vice_captain_id=str(team.vice_captain_id) if team.vice_captain_id else None,
        players=player_items,
    )




@router.get("/{contest_id}/logo")
async def get_contest_logo(contest_id: str):
    """Serve the contest logo file"""
    contest = await Contest.get(contest_id)
    if not contest or not contest.logo_file_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found")
    
    stream, content_type = await open_contest_logo_stream(contest.logo_file_id)
    data = await stream.read()
    return Response(content=data, media_type=content_type)