from typing import Annotated, Dict, List, Optional

from beanie import PydanticObjectId
from beanie.operators import Or, RegEx
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from app.common.datetime_utils import to_ist, utc_now
from app.common.enums.contests import ContestStatus, ContestVisibility
from app.common.enums.enrollments import EnrollmentStatus
from app.models.contest import Contest
from app.models.player import Player
from app.models.player_contest_points import PlayerContestPoints
from app.models.settings import GlobalSettings, default_logo_path
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.user import User
from app.routes.teams import assert_team_enrollable
from app.schemas.contest import ContestListResponse, ContestResponse
from app.schemas.enrollment import EnrollmentResponse
from app.schemas.leaderboard import LeaderboardEntrySchema, LeaderboardResponseSchema
from app.services.auction import resolve_max_players_per_team
from app.services.contest_status import (
    compute_contest_status,
    contest_status_filter_clauses,
    sync_contest_status,
)
from app.services.membership import record_play
from app.services.standings import contest_standings
from app.utils.dependencies import get_current_active_user, get_optional_current_user
from app.utils.gridfs import open_contest_logo_stream
from app.utils.tenant import TenantId, get_scoped, get_tenant, scoped, scoped_one

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


async def to_contest_response(
    contest: Contest, skip_save: bool = True
) -> ContestResponse:
    # Keep stored status in sync with real-time lifecycle.
    computed = await sync_contest_status(contest, persist=not skip_save)
    settings = await GlobalSettings.get_for_tournament(contest.tournament_id)
    logo_url = contest.logo_url
    if not logo_url and not contest.logo_file_id:
        if settings.default_contest_logo_file_id:
            logo_url = default_logo_path(contest.tournament_id)

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
        contest_format=contest.contest_format,
        purse=contest.purse,
        squad_size=contest.squad_size,
        max_players_per_team=contest.max_players_per_team,
        effective_max_players_per_team=resolve_max_players_per_team(contest, settings),
        created_at=to_ist(contest.created_at),
        updated_at=to_ist(contest.updated_at),
    )


@router.get("", response_model=ContestListResponse)
async def list_public_contests(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
    status: Annotated[ContestStatus | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
    tournament_id: TenantId = Depends(get_tenant),
):
    conditions = [Contest.visibility == ContestVisibility.PUBLIC]

    if status:
        conditions.extend(contest_status_filter_clauses(status))

    if q:
        # Text search on code or name, alongside the filters
        conditions.append(
            Or(RegEx(Contest.code, q, options="i"), RegEx(Contest.name, q, options="i"))
        )

    query = scoped(Contest, tournament_id)
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
async def list_my_enrollments(
    current_user: User = Depends(get_current_active_user),
    tournament_id: TenantId = Depends(get_tenant),
):
    """Return the authenticated user's active enrollments in this tournament."""
    enrollments = (
        await scoped(TeamContestEnrollment, tournament_id)
        .find(
            {
                "user_id": current_user.id,
                "status": "active",
            }
        )
        .to_list()
    )

    results: List[EnrollmentResponse] = []
    for enr in enrollments:
        results.append(
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
    return results


@router.get("/{contest_id}", response_model=ContestResponse)
async def get_public_contest(
    contest_id: str, tournament_id: TenantId = Depends(get_tenant)
):
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest or contest.visibility != ContestVisibility.PUBLIC:
        raise HTTPException(status_code=404, detail="Contest not found")
    return await to_contest_response(contest)


@router.get("/{contest_id}/me", response_model=ContestResponse)
async def get_contest_if_enrolled(
    contest_id: str,
    current_user: User = Depends(get_current_active_user),
    tournament_id: TenantId = Depends(get_tenant),
):
    """Return contest details if it's public OR the current user is enrolled (active)."""
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if contest.visibility == ContestVisibility.PUBLIC:
        return await to_contest_response(contest)
    # Check enrollment for private contests
    enr = await scoped_one(
        TeamContestEnrollment,
        tournament_id,
        {
            "contest_id": contest.id,
            "user_id": current_user.id,
            "status": EnrollmentStatus.ACTIVE,
        },
    )
    if not enr:
        raise HTTPException(status_code=404, detail="Contest not found")
    return await to_contest_response(contest)


@router.get("/{contest_id}/leaderboard", response_model=LeaderboardResponseSchema)
async def contest_leaderboard(
    contest_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=1000),
    current_user: Optional[User] = Depends(get_optional_current_user),
    tournament_id: TenantId = Depends(get_tenant),
):
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest or contest.visibility != ContestVisibility.PUBLIC:
        raise HTTPException(status_code=404, detail="Contest not found")

    computed = await contest_standings(contest.id, tournament_id)
    if not computed:
        return LeaderboardResponseSchema(entries=[], currentUserEntry=None)

    # pagination
    sliced = computed[skip : skip + limit]

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

    return LeaderboardResponseSchema(
        entries=entries, currentUserEntry=current_user_entry
    )


@router.post("/{contest_id}/enroll", response_model=EnrollmentResponse)
async def enroll_in_contest(
    contest_id: str,
    body: EnrollRequest,
    current_user: User = Depends(get_current_active_user),
    tournament_id: TenantId = Depends(get_tenant),
):
    """Enroll the authenticated user's team into a public contest.

    Rules:
    - Contest must exist and be public
    - Contest status cannot be completed/archived
    - Team must belong to the current user
    - Team must have been built for this contest and meet its squad rules
    - Idempotent: if already enrolled and active, return existing enrollment
    """
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest or contest.visibility != "public":
        raise HTTPException(status_code=404, detail="Contest not found")

    computed_status = compute_contest_status(contest)
    if computed_status in (ContestStatus.COMPLETED, ContestStatus.ARCHIVED):
        raise HTTPException(
            status_code=400, detail="Contest is not open for enrollment"
        )

    # validate team ownership (avoid exceptions for validation)
    if not ObjectId.is_valid(body.team_id):
        raise HTTPException(status_code=400, detail="Invalid team id")
    team = await get_scoped(Team, tournament_id, body.team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if str(team.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You can only enroll your own team")

    # Only allow non-owners to view when contest is ONGOING
    computed_status = compute_contest_status(contest)
    is_owner = current_user is not None and str(team.user_id) == str(current_user.id)
    if not is_owner and computed_status != ContestStatus.ONGOING:
        raise HTTPException(
            status_code=403, detail="Team details visible when contest is ongoing"
        )

    # Idempotent check
    existing = await scoped_one(
        TeamContestEnrollment,
        tournament_id,
        {
            "team_id": team.id,
            "contest_id": contest.id,
            "status": EnrollmentStatus.ACTIVE,
        },
    )
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

    # The team must have been built for this contest and still meet its
    # rules, whatever the format. Same check as the admin enroll path.
    await assert_team_enrollable(team, contest, tournament_id=tournament_id)

    existing_user_enrollment = await scoped_one(
        TeamContestEnrollment,
        tournament_id,
        {
            "user_id": current_user.id,
            "contest_id": contest.id,
            "status": EnrollmentStatus.ACTIVE,
        },
    )
    if existing_user_enrollment:
        raise HTTPException(
            status_code=409,
            detail="You can enroll only one team in this contest",
        )

    # Create enrollment without baseline fields (points will be contest-scoped)
    assert team.id is not None, "Team ID should not be None"
    assert contest.id is not None, "Contest ID should not be None"
    assert current_user.id is not None, "User ID should not be None"
    enr = TeamContestEnrollment(
        tournament_id=tournament_id,
        team_id=team.id,
        contest_id=contest.id,
        user_id=current_user.id,
        status=EnrollmentStatus.ACTIVE,
        enrolled_at=utc_now(),
    )
    try:
        await enr.insert()  # type: ignore
    except DuplicateKeyError as exc:
        # A concurrent request won the race past the check above; the unique
        # partial index is the authority.
        raise HTTPException(
            status_code=409,
            detail="You can enroll only one team in this contest",
        ) from exc
    if team.contest_id is None:
        # Bind a contest-less team to the contest it just passed, so later
        # edits are validated against this contest's rules.
        team.contest_id = str(contest.id)
        team.updated_at = utc_now()
        await team.save()
    await record_play(current_user, tournament_id)

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
async def get_team_in_contest(
    contest_id: str,
    team_id: str,
    current_user: Optional[User] = Depends(get_optional_current_user),
    tournament_id: TenantId = Depends(get_tenant),
):
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    team = await get_scoped(Team, tournament_id, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Allow team owner anytime; others only when contest is ONGOING or COMPLETED
    computed_status = compute_contest_status(contest)
    is_owner = current_user is not None and str(team.user_id) == str(current_user.id)
    if not is_owner and computed_status not in (
        ContestStatus.ONGOING,
        ContestStatus.COMPLETED,
    ):
        raise HTTPException(
            status_code=403,
            detail="Team details visible when contest is ongoing or completed",
        )

    enr = await scoped_one(
        TeamContestEnrollment,
        tournament_id,
        {
            "team_id": team.id,
            "contest_id": contest.id,
            "status": EnrollmentStatus.ACTIVE,
        },
    )
    if not enr:
        raise HTTPException(
            status_code=404, detail="Team is not enrolled in this contest"
        )

    # Load players for price/name/team details
    player_ids_valid = [
        PydanticObjectId(pid) for pid in team.player_ids if ObjectId.is_valid(pid)
    ]
    players = (
        await scoped(Player, tournament_id)
        .find({"_id": {"$in": player_ids_valid}})
        .to_list()
    )

    players_by_id: Dict[str, Player] = {str(p.id): p for p in players}

    # Fetch per-contest points for these players
    pcp_docs = []
    if player_ids_valid:
        pcp_docs = (
            await scoped(PlayerContestPoints, tournament_id)
            .find(
                {
                    "contest_id": contest.id,
                    "player_id": {"$in": player_ids_valid},
                }
            )
            .to_list()
        )
    pcp_points_map: Dict[str, float] = {
        str(doc.player_id): float(doc.points or 0.0) for doc in pcp_docs
    }

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
        player_items.append(
            ContestTeamPlayerSchema(
                id=pid,
                name=p.name,
                team=p.team,
                price=float(p.price or 0.0),
                base_points=0.0,
                contest_points=contest_pts,
                slot=p.slot,
            )
        )

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
    """Serve the contest logo file

    Not tenant-scoped, like the other image routes: an ``<img>`` cannot send
    the tenant header, and the id names one public image.
    """
    contest = await Contest.get(contest_id)
    if not contest or not contest.logo_file_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found"
        )

    stream, content_type = await open_contest_logo_stream(contest.logo_file_id)
    data = await stream.read()
    return Response(content=data, media_type=content_type)
