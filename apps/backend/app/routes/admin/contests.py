import logging
import re
from datetime import datetime
from io import BytesIO
from typing import List, Optional
from urllib.parse import quote

from beanie import PydanticObjectId
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi import status as http_status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from app.common.datetime_utils import to_ist, to_utc_naive, utc_now
from app.common.enums.contests import ContestFormat, ContestStatus, ContestVisibility
from app.common.enums.enrollments import EnrollmentStatus
from app.models.contest import Contest
from app.models.player import Player
from app.models.player_contest_points import PlayerContestPoints
from app.models.settings import GlobalSettings, default_logo_path
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.tournament import Tournament
from app.models.user import User
from app.routes.teams import find_teams_breaking_slot_rules, slot_rule_reasons_by_team
from app.schemas.admin.cricheroes_points import ContestPointsSummary
from app.schemas.contest import (
    ContestCreate,
    ContestListResponse,
    ContestResponse,
    ContestUpdate,
)
from app.schemas.enrollment import (
    EnrollmentBulkRequest,
    EnrollmentResponse,
    UnenrollBulkRequest,
)
from app.services import cricheroes_cache, cricheroes_points
from app.services.auction import (
    assert_auction_config_feasible,
    assert_slot_purse_config_feasible,
    find_teams_breaking_auction_rules,
    purse_rule_reasons_by_team,
    resolve_max_players_per_team,
)
from app.services.contest_status import (
    contest_status_filter_clauses,
    sync_contest_status,
)
from app.utils.dependencies import get_tournament_admin
from app.utils.gridfs import (
    delete_contest_logo_from_gridfs,
    upload_contest_logo_to_gridfs,
)
from app.utils.tenant import TenantId, get_scoped, get_tenant, scoped, scoped_one
from config.settings import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/contests", tags=["Admin - Contests"])

# What a contest scored from CricHeroes covers: changing any of these while it
# is on rescores it straight away (spec §9.3).
_CRICHEROES_SCOPE_FIELDS = ("start_at", "end_at", "contest_type", "allowed_teams")


async def _cricheroes_tournament_for_scoring(tournament_id: TenantId) -> int:
    """The CricHeroes tournament this tournament's contests can be scored
    from, or a 422 saying why there is none."""
    tournament = await Tournament.get(tournament_id) if tournament_id else None
    linked = tournament.cricheroes_tournament_id if tournament else None
    if linked is None:
        raise HTTPException(
            status_code=422,
            detail=(
                "This tournament is not linked to a CricHeroes tournament, so "
                "there are no points to take. A platform admin links it in "
                "Admin > Tournaments."
            ),
        )
    if linked not in await cricheroes_cache.tournaments_to_sync():
        # It is linked, so the operator's cap is what keeps the sync from
        # reading it.
        raise HTTPException(
            status_code=422,
            detail=(
                f"CricHeroes tournament {linked} is not among the tournaments "
                "the scheduled sync reads"
                + (
                    " (CRICHEROES_SYNC_TOURNAMENT_IDS holds it back)"
                    if get_settings().cricheroes_sync_tournaments
                    else ""
                )
                + ", so no MVP table of it would ever be read."
            ),
        )
    return linked


def _changed(new, old) -> bool:
    # The schema hands back aware IST datetimes and the stored ones are naive
    # UTC: the same moment must not read as a change.
    if isinstance(new, datetime) and isinstance(old, datetime):
        return to_utc_naive(new) != to_utc_naive(old)
    return new != old


async def _cached_matches(cricheroes_tournament_id: Optional[int]) -> list:
    if cricheroes_tournament_id is None:
        return []
    cached = await cricheroes_cache.read("matches", cricheroes_tournament_id)
    return cached.data if cached else []


async def _score_from_cricheroes(contest: Contest, cricheroes_tournament_id: int):
    """Score a contest from the MVP tables already stored: no request to
    CricHeroes. A failure is logged, not raised -- the contest is saved, and
    the next scheduled sync scores it."""
    try:
        await cricheroes_points.score_contest(
            contest,
            cricheroes_tournament_id,
            await _cached_matches(cricheroes_tournament_id),
        )
    except Exception:  # noqa: BLE001
        logger.exception("Scoring contest %s from CricHeroes failed", contest.id)


async def to_response(contest: Contest) -> ContestResponse:
    status = await sync_contest_status(contest, persist=False)
    settings = await GlobalSettings.get_for_tournament(contest.tournament_id)
    logo_url = contest.logo_url
    if not logo_url and not contest.logo_file_id:
        # Fallback to default tournament logo
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
        status=status,
        visibility=contest.visibility,
        points_scope=contest.points_scope,
        contest_type=contest.contest_type,
        allowed_teams=contest.allowed_teams or [],
        contest_format=contest.contest_format,
        purse=contest.purse,
        squad_size=contest.squad_size,
        max_players_per_team=contest.max_players_per_team,
        effective_max_players_per_team=resolve_max_players_per_team(contest, settings),
        points_from_cricheroes=contest.points_from_cricheroes,
        created_at=to_ist(contest.created_at),
        updated_at=to_ist(contest.updated_at),
    )


@router.post("", response_model=ContestResponse, status_code=201)
async def create_contest(
    data: ContestCreate,
    current_user: User = Depends(get_tournament_admin),
    tournament_id: TenantId = Depends(get_tenant),
):
    if data.start_at >= data.end_at:
        raise HTTPException(status_code=400, detail="start_at must be before end_at")

    existing = await scoped_one(Contest, tournament_id, Contest.code == data.code)
    if existing:
        raise HTTPException(status_code=400, detail="Contest code already exists")

    cricheroes_tournament_id = (
        await _cricheroes_tournament_for_scoring(tournament_id)
        if data.points_from_cricheroes
        else None
    )

    # Reject an auction setup no participant could satisfy, before it is saved.
    if data.contest_format == ContestFormat.AUCTION_PURSE:
        settings = await GlobalSettings.get_for_tournament(tournament_id)
        await assert_auction_config_feasible(
            squad_size=data.squad_size,
            purse=data.purse,
            max_per_team=data.max_players_per_team or settings.max_players_per_team,
            # A daily contest can only draw from its named teams, so the rest
            # of the pool must not count towards feasibility.
            allowed_teams=(
                data.allowed_teams if data.contest_type == "daily" else None
            ),
            tournament_id=tournament_id,
        )
    elif data.contest_format == ContestFormat.SLOT_PURSE:
        await assert_slot_purse_config_feasible(
            purse=data.purse,
            allowed_teams=(
                data.allowed_teams if data.contest_type == "daily" else None
            ),
            tournament_id=tournament_id,
        )

    now = utc_now()
    contest = Contest(
        tournament_id=tournament_id,
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
        contest_format=data.contest_format,
        purse=data.purse,
        squad_size=data.squad_size,
        max_players_per_team=data.max_players_per_team,
        points_from_cricheroes=data.points_from_cricheroes,
        created_at=now,
        updated_at=now,
    )
    await contest.insert()
    if cricheroes_tournament_id is not None:
        await _score_from_cricheroes(contest, cricheroes_tournament_id)
    return await to_response(contest)


@router.get("", response_model=ContestListResponse)
async def list_contests(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status: Optional[ContestStatus] = Query(None),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_tournament_admin),
    tournament_id: TenantId = Depends(get_tenant),
):
    conditions = []
    if status:
        conditions.extend(contest_status_filter_clauses(status))

    if search:
        from beanie.operators import Or, RegEx

        conditions.append(
            Or(
                RegEx(Contest.code, search, options="i"),
                RegEx(Contest.name, search, options="i"),
            )
        )

    query = scoped(Contest, tournament_id)
    for cond in conditions:
        query = query.find(cond)

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
async def get_contest(
    contest_id: str,
    current_user: User = Depends(get_tournament_admin),
    tournament_id: TenantId = Depends(get_tenant),
):
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    return await to_response(contest)


# Fields that define what a legal squad looks like. Only a change to one of
# these can turn a squad that was legal when it was built into a broken one,
# which is what gates the broken-team checks in update_contest below.
_RULE_FIELDS = (
    "squad_size",
    "purse",
    "max_players_per_team",
    "contest_format",
    "allowed_teams",
    # contest_type decides whether allowed_teams applies at all, so switching
    # between daily and full changes the rules without touching the list.
    "contest_type",
)


@router.put("/{contest_id}", response_model=ContestResponse)
async def update_contest(
    contest_id: str,
    data: ContestUpdate,
    force: bool = Query(False),
    current_user: User = Depends(get_tournament_admin),
    tournament_id: TenantId = Depends(get_tenant),
):
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    update_fields = data.model_dump(exclude_unset=True)

    if "code" in update_fields:
        update_fields.pop("code")  # immutable

    # Both ends are required on the model, so an explicit null cannot clear one.
    for field in ("start_at", "end_at"):
        if field in update_fields and update_fields[field] is None:
            raise HTTPException(status_code=400, detail=f"{field} cannot be empty")

    # The schema hands back aware IST values and the stored ones are naive UTC,
    # so a partial update (only start_at or only end_at) mixes the two.
    new_start = to_utc_naive(update_fields.get("start_at", contest.start_at))
    new_end = to_utc_naive(update_fields.get("end_at", contest.end_at))
    if new_start >= new_end:
        raise HTTPException(status_code=400, detail="start_at must be before end_at")

    # Re-check feasibility against the merged result, so an edit cannot leave a
    # contest in a state no participant could satisfy.
    new_format = update_fields.get("contest_format", contest.contest_format)

    # Re-validating every squad on every save meant a single already-broken
    # squad froze all contest editing — including edits that cannot affect
    # squad validity at all, like moving the schedule. A squad only becomes
    # broken when the rules move under it, so that is what the checks below
    # key on. Note this compares against the stored value: resubmitting the
    # same rule unchanged is not a change.
    rules_changed = any(
        f in update_fields and update_fields[f] != getattr(contest, f)
        for f in _RULE_FIELDS
    )

    if new_format == ContestFormat.AUCTION_PURSE:
        settings = await GlobalSettings.get_for_tournament(tournament_id)
        new_max = update_fields.get(
            "max_players_per_team", contest.max_players_per_team
        )
        new_squad_size = update_fields.get("squad_size", contest.squad_size)
        new_purse = update_fields.get("purse", contest.purse)
        new_type = update_fields.get("contest_type", contest.contest_type)
        new_allowed = update_fields.get("allowed_teams", contest.allowed_teams)
        effective_allowed = new_allowed if new_type == "daily" else None
        effective_max = new_max or settings.max_players_per_team

        await assert_auction_config_feasible(
            squad_size=new_squad_size,
            purse=new_purse,
            max_per_team=effective_max,
            allowed_teams=effective_allowed,
            tournament_id=tournament_id,
        )

        # Tightening the rules must not silently strand squads that were legal
        # when they were built; they would stay enrolled and keep scoring.
        if rules_changed and not force:
            broken = await find_teams_breaking_auction_rules(
                contest_id=str(contest.id),
                squad_size=new_squad_size,
                purse=new_purse,
                max_per_team=effective_max,
                allowed_teams=effective_allowed,
                tournament_id=tournament_id,
            )
            if broken:
                shown = broken[:5]
                more = len(broken) - len(shown)
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": (
                            f"{len(broken)} existing team(s) would break under these "
                            f"rules. Fix or remove them, or repeat the request with "
                            f"force=true to apply anyway."
                        ),
                        "broken_teams": shown
                        + ([f"and {more} more"] if more > 0 else []),
                    },
                )
    elif new_format == ContestFormat.SLOT_PURSE and rules_changed:
        settings = await GlobalSettings.get_for_tournament(tournament_id)
        new_purse = update_fields.get("purse", contest.purse)
        new_max = update_fields.get(
            "max_players_per_team", contest.max_players_per_team
        )
        new_type = update_fields.get("contest_type", contest.contest_type)
        new_allowed = update_fields.get("allowed_teams", contest.allowed_teams)
        effective_allowed = new_allowed if new_type == "daily" else None
        effective_max = new_max or settings.max_players_per_team

        # Only when the rules move: a player going inactive later must not
        # freeze edits that cannot affect squads, like renaming or rescheduling.
        await assert_slot_purse_config_feasible(
            purse=new_purse,
            allowed_teams=effective_allowed,
            tournament_id=tournament_id,
        )

        if not force:
            # Every rule a slot_purse squad must meet: slot shape, then purse,
            # per-team cap, allowed teams and the daily per-team minimum. One line
            # per team, however many rules it breaks, so the count and the preview
            # stay honest.
            slot_reasons = await slot_rule_reasons_by_team(
                contest_id=str(contest.id), tournament_id=tournament_id
            )
            purse_reasons = await purse_rule_reasons_by_team(
                contest_id=str(contest.id),
                purse=new_purse,
                max_per_team=effective_max,
                allowed_teams=effective_allowed,
                # Same daily minimum that create and update enforce, so a
                # switch to daily cannot leave one-sided squads scoring.
                min_per_team=settings.min_players_per_team,
                tournament_id=tournament_id,
            )
            broken = []
            for team_id in dict.fromkeys([*slot_reasons, *purse_reasons]):
                name, reasons = slot_reasons.get(team_id, (None, []))
                if team_id in purse_reasons:
                    name, purse_reason = purse_reasons[team_id]
                    reasons = [*reasons, purse_reason]
                broken.append(f"{name} " + "; ".join(reasons))
            if broken:
                shown = broken[:5]
                more = len(broken) - len(shown)
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": (
                            f"{len(broken)} existing team(s) would break under these "
                            f"rules. Fix or remove them, or repeat the request with "
                            f"force=true to apply anyway."
                        ),
                        "broken_teams": shown
                        + ([f"and {more} more"] if more > 0 else []),
                    },
                )
    elif new_format == ContestFormat.SLOT_BASED and rules_changed and not force:
        # Symmetric to the auction_purse branch above: a squad shape now
        # comes from slot config instead of the purse, so a switch away from
        # auction_purse (or an edit while already slot_based) must not leave
        # existing squads enrolled and scoring against slot rules they were
        # never checked against.
        broken = await find_teams_breaking_slot_rules(
            contest_id=str(contest.id), tournament_id=tournament_id
        )
        if broken:
            shown = broken[:5]
            more = len(broken) - len(shown)
            raise HTTPException(
                status_code=400,
                detail={
                    "message": (
                        f"{len(broken)} existing team(s) would break under slot "
                        f"rules. Fix or remove them, or repeat the request with "
                        f"force=true to apply anyway."
                    ),
                    "broken_teams": shown + ([f"and {more} more"] if more > 0 else []),
                },
            )

    if update_fields.get("points_from_cricheroes") is None:
        # An explicit null leaves the switch as it is.
        update_fields.pop("points_from_cricheroes", None)
    turning_on = (
        update_fields.get("points_from_cricheroes") is True
        and not contest.points_from_cricheroes
    )
    scope_moved = update_fields.get(
        "points_from_cricheroes", contest.points_from_cricheroes
    ) and any(
        f in update_fields and _changed(update_fields[f], getattr(contest, f))
        for f in _CRICHEROES_SCOPE_FIELDS
    )
    if turning_on:
        cricheroes_tournament_id = await _cricheroes_tournament_for_scoring(
            tournament_id
        )
    elif scope_moved:
        # Already on: rescore if it still can be, but never refuse a date edit
        # over the link -- the contest's summary shows what is missing.
        cricheroes_tournament_id = await cricheroes_points.linked_tournament_id(contest)
    else:
        cricheroes_tournament_id = None

    for k, v in update_fields.items():
        setattr(contest, k, v)
    contest.updated_at = utc_now()
    await contest.save()
    if cricheroes_tournament_id is not None:
        await _score_from_cricheroes(contest, cricheroes_tournament_id)
    return await to_response(contest)


@router.delete("/{contest_id}")
async def delete_contest(
    contest_id: str,
    force: bool = Query(False),
    current_user: User = Depends(get_tournament_admin),
    tournament_id: TenantId = Depends(get_tenant),
):
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    active_enrollments = (
        await scoped(TeamContestEnrollment, tournament_id)
        .find(
            {
                "contest_id": contest.id,
                "status": EnrollmentStatus.ACTIVE,
            }
        )
        .count()
    )

    # If there are active enrollments, honor force=true to unenroll and proceed.
    if active_enrollments > 0:
        if force:
            # mark all active enrollments removed
            async for enr in scoped(TeamContestEnrollment, tournament_id).find(
                {
                    "contest_id": contest.id,
                    "status": EnrollmentStatus.ACTIVE,
                }
            ):
                enr.status = EnrollmentStatus.REMOVED
                enr.removed_at = utc_now()
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
    current_user: User = Depends(get_tournament_admin),
    tournament_id: TenantId = Depends(get_tenant),
):
    contest = await get_scoped(Contest, tournament_id, contest_id)
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
        team = await get_scoped(Team, tournament_id, oid)
        if not team:
            raise HTTPException(status_code=404, detail=f"Team not found: {tid}")

        # Ensure no duplicate active enrollment
        # Separate arguments, which find_one ANDs together. Beanie's operators
        # do not support `&`: joined with it, this raised TypeError for every
        # team, so the endpoint could never enroll one.
        existing = await scoped_one(
            TeamContestEnrollment,
            tournament_id,
            TeamContestEnrollment.team_id == team.id,
            TeamContestEnrollment.contest_id == contest.id,
            TeamContestEnrollment.status == "active",
        )
        if existing:
            # skip duplicates silently
            continue

        existing_for_user = await scoped_one(
            TeamContestEnrollment,
            tournament_id,
            TeamContestEnrollment.user_id == team.user_id,
            TeamContestEnrollment.contest_id == contest.id,
            TeamContestEnrollment.status == EnrollmentStatus.ACTIVE,
        )
        if existing_for_user:
            # one active team per user per contest
            continue

        enr = TeamContestEnrollment(
            tournament_id=tournament_id,
            team_id=team.id,
            user_id=team.user_id,
            contest_id=contest.id,
            status=EnrollmentStatus.ACTIVE,
            enrolled_at=utc_now(),
        )
        try:
            await enr.insert()
        except DuplicateKeyError:
            # Another active enrollment for this user landed first; skip this
            # team rather than failing the whole batch.
            continue
        # Persist contest_id on the team for convenience
        try:
            team.contest_id = str(contest.id)
            team.updated_at = utc_now()
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
    current_user: User = Depends(get_tournament_admin),
    tournament_id: TenantId = Depends(get_tenant),
):
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    count = 0
    # Collect affected team ids to batch-check for remaining active enrollments
    from typing import Set

    affected_team_ids: Set[PydanticObjectId] = set()

    if body.enrollment_ids:
        for eid in body.enrollment_ids:
            enr = await get_scoped(TeamContestEnrollment, tournament_id, eid)
            if enr and enr.contest_id == contest.id and enr.status == "active":
                enr.status = "removed"
                enr.removed_at = utc_now()
                await enr.save()
                count += 1
                affected_team_ids.add(enr.team_id)

    if body.team_ids:
        for tid in body.team_ids:
            try:
                toid = PydanticObjectId(tid)
            except Exception:
                continue
            enr = await scoped_one(
                TeamContestEnrollment,
                tournament_id,
                TeamContestEnrollment.team_id == toid,
                TeamContestEnrollment.contest_id == contest.id,
                TeamContestEnrollment.status == EnrollmentStatus.ACTIVE,
            )
            if enr:
                enr.status = EnrollmentStatus.REMOVED
                enr.removed_at = utc_now()
                await enr.save()
                count += 1
                affected_team_ids.add(toid)

    # Batch check and clear team.contest_id for teams with no remaining active enrollments
    if affected_team_ids:
        try:
            # Find teams that still have at least one active enrollment for this contest
            still_active_team_ids: Set[PydanticObjectId] = set()
            async for active in scoped(TeamContestEnrollment, tournament_id).find(
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
                team = await get_scoped(Team, tournament_id, tid)
                if team and team.contest_id is not None:
                    team.contest_id = None
                    team.updated_at = utc_now()
                    await team.save()
        except Exception:
            # Best-effort cleanup; ignore errors
            pass

    return {"unenrolled": count}


from typing import Dict

# -------- Per-Contest Player Points Management --------
from pydantic import BaseModel


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
    current_user: User = Depends(get_tournament_admin),
    tournament_id: TenantId = Depends(get_tenant),
):
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    docs = (
        await scoped(PlayerContestPoints, tournament_id)
        .find({"contest_id": contest.id})
        .to_list()
    )
    # fetch player details in batch
    pid_set = [doc.player_id for doc in docs]
    players_by_id: Dict[str, Player] = {}
    if pid_set:
        players = (
            await scoped(Player, tournament_id)
            .find({"_id": {"$in": pid_set}})
            .to_list()
        )
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
    current_user: User = Depends(get_tournament_admin),
    tournament_id: TenantId = Depends(get_tenant),
):
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if contest.points_from_cricheroes:
        # The next sync would overwrite them without a word (spec §9.3).
        raise HTTPException(
            status_code=409,
            detail=(
                "This contest takes its points from CricHeroes, and the next "
                'sync would overwrite any entered here. Turn off "Points from '
                'CricHeroes" on the contest to enter them by hand.'
            ),
        )

    if not body.updates:
        return []

    # Validate player ids and build list
    valid_items: list[tuple[PydanticObjectId, float]] = []
    for item in body.updates:
        try:
            poid = PydanticObjectId(item.player_id)
        except Exception:
            raise HTTPException(
                status_code=400, detail=f"Invalid player id: {item.player_id}"
            )
        valid_items.append((poid, float(item.points)))

    # Upsert
    updated_docs: list[PlayerContestPoints] = []
    now = utc_now()
    for poid, pts in valid_items:
        existing = await scoped_one(
            PlayerContestPoints,
            tournament_id,
            {
                "contest_id": contest.id,
                "player_id": poid,
            },
        )
        if existing:
            existing.points = pts
            existing.updated_at = now
            await existing.save()
            updated_docs.append(existing)
        else:
            doc = PlayerContestPoints(
                tournament_id=tournament_id,
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
        players = (
            await scoped(Player, tournament_id)
            .find({"_id": {"$in": pid_set}})
            .to_list()
        )
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
    try:
        if contest.contest_type != "daily" and updated_docs:
            # Batch update players so that Player.points equals the contest total for this contest
            for doc in updated_docs:
                try:
                    player = await get_scoped(Player, tournament_id, doc.player_id)
                    if player:
                        player.points = float(doc.points or 0.0)
                        player.updated_at = utc_now()
                        await player.save()
                except Exception:
                    # continue best-effort for each player, do not fail the response
                    continue
    except Exception:
        # Non-blocking
        pass

    return resp


@router.get("/{contest_id}/cricheroes-points", response_model=ContestPointsSummary)
async def get_cricheroes_points(
    contest_id: str,
    current_user: User = Depends(get_tournament_admin),
    tournament_id: TenantId = Depends(get_tenant),
):
    """Which CricHeroes matches count towards the contest, how many players
    score, and who is not linked -- from what is stored, with no request to
    CricHeroes (spec §9.3)."""
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    linked = await cricheroes_points.linked_tournament_id(contest)
    plan = await cricheroes_points.plan_contest(
        contest, linked, await _cached_matches(linked)
    )
    return plan.summary


# -------- Per-Contest Logo Management --------


class UploadResponse(BaseModel):
    url: str
    message: str


@router.post("/{contest_id}/upload-logo", response_model=UploadResponse)
async def upload_contest_logo(
    contest_id: str,
    file: UploadFile = File(..., description="Contest logo image"),
    current_user: User = Depends(get_tournament_admin),
    tournament_id: TenantId = Depends(get_tenant),
):
    contest = await get_scoped(Contest, tournament_id, contest_id)
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
        contest.updated_at = utc_now()
        await contest.save()
        return UploadResponse(
            url=contest.logo_url, message="Logo uploaded successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload logo: {str(e)}")


@router.get(
    "/{contest_id}/leaderboard/export",
    responses={
        404: {"description": "Contest not found"},
        500: {"description": "Server error"},
    },
)
async def export_contest_leaderboard_excel(
    contest_id: str,
    current_user: User = Depends(get_tournament_admin),
    tournament_id: TenantId = Depends(get_tenant),
):
    """
    Export a contest's leaderboard as an .xlsx file.
    Requires authentication.
    """
    contest = await get_scoped(Contest, tournament_id, contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    enrollments = (
        await scoped(TeamContestEnrollment, tournament_id)
        .find(
            {
                "contest_id": contest.id,
                "status": EnrollmentStatus.ACTIVE,
            }
        )
        .to_list()
    )

    team_ids = [enr.team_id for enr in enrollments]
    teams = (
        await scoped(Team, tournament_id).find({"_id": {"$in": team_ids}}).to_list()
        if team_ids
        else []
    )
    teams_by_id = {str(t.id): t for t in teams}

    user_ids = list({t.user_id for t in teams})
    users = await User.find({"_id": {"$in": user_ids}}).to_list() if user_ids else []
    users_by_id = {str(u.id): u for u in users}

    all_player_ids: set = set()
    team_player_oids_map: dict = {}
    for enr in enrollments:
        team = teams_by_id.get(str(enr.team_id))
        if not team:
            continue
        oids = []
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
        pcp_docs = (
            await scoped(PlayerContestPoints, tournament_id)
            .find(
                {
                    "contest_id": contest.id,
                    "player_id": {"$in": list(all_player_ids)},
                }
            )
            .to_list()
        )
    pcp_points_map = {str(doc.player_id): float(doc.points or 0.0) for doc in pcp_docs}

    players_by_id = {}
    if all_player_ids:
        player_docs = (
            await scoped(Player, tournament_id)
            .find({"_id": {"$in": list(all_player_ids)}})
            .to_list()
        )
        players_by_id = {str(p.id): p for p in player_docs}

    computed_rows = []
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
        selected_player_names = []
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

    raw_code = contest.code or "contest"
    safe_code = re.sub(r"[^A-Za-z0-9._-]+", "_", raw_code).strip("._") or "contest"
    filename_ascii = (
        f"leaderboard_{safe_code}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    )
    filename_star = quote(filename_ascii)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{filename_ascii}"; '
                f"filename*=UTF-8''{filename_star}"
            )
        },
    )
