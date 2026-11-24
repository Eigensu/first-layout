from typing import Dict, List, Optional, Tuple

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.common.datetime_utils import utc_now
from app.common.enums.contests import ContestStatus
from app.common.enums.enrollments import EnrollmentStatus
from app.models.admin.slot import Slot
from app.models.contest import Contest
from app.models.player import Player
from app.models.settings import GlobalSettings
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.user import User
from app.schemas.team import TeamCreate, TeamResponse, TeamsListResponse, TeamUpdate
from app.services.auction import (
    is_auction_contest,
    is_slot_purse_contest,
    resolve_max_players_per_team,
    validate_auction_squad,
    validate_squad_purse,
)
from app.services.contest_status import compute_contest_status
from app.services.membership import record_play
from app.services.team_composition import validate_team_composition
from app.utils.dependencies import get_current_active_user
from app.utils.tenant import TenantId, get_scoped, get_tenant, scoped, scoped_one

router = APIRouter(prefix="/api/teams", tags=["teams"])


async def _get_dynamic_max_players_from_slots(
    *, tournament_id: TenantId
) -> Optional[int]:
    """Compute maximum team size from slot configuration using total min_select."""
    slots = await scoped(Slot, tournament_id).to_list()
    if not slots:
        return None
    return sum(max(0, slot.min_select) for slot in slots)


async def _resolve_contest(
    contest_id: Optional[str], *, tournament_id: TenantId
) -> Optional[Contest]:
    """Load this tournament's contest by id, or None when none is attached."""
    if not contest_id:
        return None
    return await get_scoped(Contest, tournament_id, contest_id)


async def _compute_slot_violations(
    players: List[Player], *, tournament_id: TenantId
) -> List[dict]:
    """
    The single definition of what makes a slot-based squad valid.

    Returns one violation dict per broken slot, or an empty list when the
    squad is legal. Shared by submission-time validation and admin
    reconciliation of existing teams so the two cannot drift apart.
    """
    # Count players per slot (ignore players without a slot)
    slot_counts: Dict[str, int] = {}
    for p in players:
        if p.slot:
            slot_counts[p.slot] = slot_counts.get(p.slot, 0) + 1

    # Build validation set: slots present in selection + all slots with min_select > 0
    present_slot_oids = []
    for sid in slot_counts.keys():
        try:
            present_slot_oids.append(PydanticObjectId(sid))
        except Exception:
            # If slot id is malformed, skip; it won't be validated
            continue
    slots_present = (
        await scoped(Slot, tournament_id)
        .find({"_id": {"$in": present_slot_oids}})
        .to_list()
        if present_slot_oids
        else []
    )
    slots_with_min = (
        await scoped(Slot, tournament_id).find(Slot.min_select > 0).to_list()
    )

    # Merge unique slots by id
    slots_by_id: Dict[str, Slot] = {str(s.id): s for s in slots_present}
    for s in slots_with_min:
        slots_by_id.setdefault(str(s.id), s)

    violations = []
    for sid, slot in slots_by_id.items():
        count = slot_counts.get(sid, 0)
        if count < slot.min_select or count > slot.max_select:
            violations.append(
                {
                    "slot": {"id": sid, "code": slot.code, "name": slot.name},
                    "expected": {
                        "min_select": slot.min_select,
                        "max_select": slot.max_select,
                    },
                    "actual": count,
                }
            )
    return violations


async def _validate_slot_constraints(
    players: List[Player], *, tournament_id: TenantId
) -> None:
    """
    Enforce per-slot min/max selection rules on a squad.

    Only applies to slot-based contests; auction contests draw from a single
    open pool and have no slot structure. Shared by the create and update
    paths so the two stay in sync.
    """
    violations = await _compute_slot_violations(players, tournament_id=tournament_id)
    if violations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Team violates per-slot selection constraints",
                "violations": violations,
            },
        )


async def slot_rule_reasons_by_team(
    contest_id: str, *, tournament_id: TenantId
) -> Dict[str, Tuple[str, List[str]]]:
    """
    Squads in this contest that current slot rules would invalidate, keyed by
    team id: ``{team_id: (team_name, [reason, ...])}``.

    Keyed by id so a caller combining these with other rule checks can list
    each team once, whatever its name.
    """
    teams = (
        await scoped(Team, tournament_id)
        .find(Team.contest_id == str(contest_id))
        .to_list()
    )
    if not teams:
        return {}

    referenced: set = set()
    for team in teams:
        for pid in team.player_ids:
            try:
                referenced.add(PydanticObjectId(pid))
            except Exception:
                continue
    players = (
        await scoped(Player, tournament_id)
        .find({"_id": {"$in": list(referenced)}})
        .to_list()
        if referenced
        else []
    )
    by_id = {str(p.id): p for p in players}

    broken: Dict[str, Tuple[str, List[str]]] = {}
    for team in teams:
        squad = [by_id[pid] for pid in team.player_ids if pid in by_id]
        violations = await _compute_slot_violations(squad, tournament_id=tournament_id)
        if len(squad) != len(team.player_ids) or violations:
            reasons = [
                f"{v['slot']['name']}: has {v['actual']}, needs "
                f"{v['expected']['min_select']}-{v['expected']['max_select']}"
                for v in violations
            ]
            if len(squad) != len(team.player_ids):
                reasons.append(
                    f"references {len(team.player_ids) - len(squad)} player(s) "
                    f"that no longer resolve"
                )
            broken[str(team.id)] = (team.team_name, reasons)

    return broken


async def find_teams_breaking_slot_rules(
    contest_id: str, *, tournament_id: TenantId
) -> List[str]:
    """
    Existing squads in this contest that current slot rules would invalidate.

    Returns one "<team name> <reason>" line per broken team. Switching a
    contest from auction_purse to slot_based (or editing slot config) would
    otherwise leave squads built under the old rules enrolled and scoring
    without ever being checked against slot composition.
    """
    reasons = await slot_rule_reasons_by_team(contest_id, tournament_id=tournament_id)
    return [f"{name} " + "; ".join(why) for name, why in reasons.values()]


def _assert_allowed_teams(players: List[Player], contest: Optional[Contest]) -> None:
    """Daily contests restrict selection to their two real-world teams."""
    if contest is None or contest.contest_type != "daily" or not contest.allowed_teams:
        return
    disallowed = [
        p.name for p in players if p.team and p.team not in contest.allowed_teams
    ]
    if disallowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Selected players include teams disallowed for this daily contest",
                "disallowed_players": disallowed,
                "allowed_teams": contest.allowed_teams,
            },
        )


async def _load_squad_players(
    player_ids: List[str], *, tournament_id: TenantId
) -> List[Player]:
    """Resolve player ids, refusing any that are malformed or resolve to nothing.

    An id that resolves to nothing would otherwise silently shrink the squad
    and understate its cost against the purse.
    """
    player_object_ids = []
    for pid in player_ids:
        try:
            player_object_ids.append(PydanticObjectId(pid))
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid player ID: {pid}",
            )
    players = (
        await scoped(Player, tournament_id)
        .find({"_id": {"$in": player_object_ids}})
        .to_list()
    )
    if len(players) != len(player_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Some player IDs are invalid",
        )
    return players


async def validate_squad_for_contest(
    players: List[Player],
    contest: Optional[Contest],
    submitted_count: int,
    *,
    tournament_id: TenantId,
) -> float:
    """
    The single definition of a legal squad for a contest, in every format.

    Raises HTTPException(400) on the first broken rule and returns the
    squad's total value otherwise. Team create, team update and both enroll
    paths (user and admin) go through here, so a squad cannot reach a
    contest's leaderboard without meeting that contest's rules.

    - Every format: a daily contest's allowed teams.
    - auction_purse: exact squad size, per-team cap, purse, eligible players.
    - slot_based: slot min/max, total size from slots, per-team limits.
    - slot_purse: the slot_based rules plus one purse for the whole squad.
    """
    _assert_allowed_teams(players, contest)

    if is_auction_contest(contest):
        settings = await GlobalSettings.get_for_tournament(tournament_id)
        return await validate_auction_squad(
            players=players,
            contest=contest,
            submitted_count=submitted_count,
            max_per_team=resolve_max_players_per_team(contest, settings),
        )

    # Squad size comes from slots outside auction mode.
    max_players_allowed = await _get_dynamic_max_players_from_slots(
        tournament_id=tournament_id
    )
    if max_players_allowed is not None and submitted_count > max_players_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {max_players_allowed} players allowed",
        )
    await _validate_slot_constraints(players, tournament_id=tournament_id)
    # Enforce per-real-world-team composition limits
    await validate_team_composition(
        players=players,
        contest=contest,
        squad_size=submitted_count,
        max_players_allowed=max_players_allowed,
        tournament_id=tournament_id,
    )
    # slot_purse: the slot rules above, plus one purse for the whole squad.
    if is_slot_purse_contest(contest):
        return validate_squad_purse(players, contest)
    return sum(player.price for player in players)


async def assert_team_enrollable(
    team: Team, contest: Contest, *, tournament_id: TenantId
) -> None:
    """
    Refuse to enroll a team that was not built for this contest, or whose
    squad does not meet the contest's current rules.

    Shared by the user enroll route and the admin bulk enroll route. The
    squad is re-checked here, not trusted from when it was saved: a team
    built for one contest must not be able to join another whose rules it
    was never checked against, and the rules may have moved since.

    A team saved without a contest (built from the teams page) may still join
    one, but only by passing that contest's full rules here; the enroll
    routes then bind it to the contest so later edits are checked against it.
    """
    if team.contest_id is not None and team.contest_id != str(contest.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This team was built for a different contest. "
                "Build a team for this contest to join it."
            ),
        )

    if (
        not team.captain_id
        or not team.vice_captain_id
        or team.captain_id not in team.player_ids
        or team.vice_captain_id not in team.player_ids
        or team.captain_id == team.vice_captain_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team needs a captain and a different vice-captain from its squad",
        )

    players = await _load_squad_players(team.player_ids, tournament_id=tournament_id)
    await validate_squad_for_contest(
        players, contest, len(team.player_ids), tournament_id=tournament_id
    )


@router.post("/", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    team_data: TeamCreate,
    current_user: User = Depends(get_current_active_user),
    tournament_id: TenantId = Depends(get_tenant),
):
    """
    Create a new fantasy team for the current user
    """
    # Resolve the contest first: an auction contest sizes and prices its squad
    # differently, so the format has to be known before any slot rule runs.
    contest = None
    if team_data.contest_id:
        contest = await _resolve_contest(
            team_data.contest_id, tournament_id=tournament_id
        )
        if not contest:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid contest_id"
            )

        # Prevent joining an ongoing contest.
        computed_status = compute_contest_status(contest)
        if computed_status == ContestStatus.ONGOING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot create a team for an ongoing contest.",
            )

    # Validate that captain and vice-captain are in the player list
    if team_data.captain_id not in team_data.player_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captain must be one of the selected players",
        )

    if team_data.vice_captain_id not in team_data.player_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vice-captain must be one of the selected players",
        )

    if team_data.captain_id == team_data.vice_captain_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captain and vice-captain must be different players",
        )

    players = await _load_squad_players(
        team_data.player_ids, tournament_id=tournament_id
    )
    total_value = await validate_squad_for_contest(
        players, contest, len(team_data.player_ids), tournament_id=tournament_id
    )

    user_id = current_user.id
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user is invalid",
        )

    if team_data.contest_id:
        existing_contest_team = await scoped_one(
            Team,
            tournament_id,
            Team.user_id == user_id,
            Team.contest_id == team_data.contest_id,
        )
        if existing_contest_team:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You can create only one team per contest",
            )

    # Create team document
    team = Team(
        tournament_id=tournament_id,
        user_id=user_id,
        team_name=team_data.team_name,
        player_ids=team_data.player_ids,
        captain_id=team_data.captain_id,
        vice_captain_id=team_data.vice_captain_id,
        total_value=total_value,
        contest_id=team_data.contest_id,
    )

    await team.insert()  # type: ignore[misc]
    await record_play(current_user, tournament_id)

    return TeamResponse(
        id=str(team.id),
        user_id=str(team.user_id),
        team_name=team.team_name,
        player_ids=team.player_ids,
        captain_id=team.captain_id,
        vice_captain_id=team.vice_captain_id,
        total_points=team.total_points,
        total_value=team.total_value,
        rank=team.rank,
        rank_change=team.rank_change,
        contest_id=team.contest_id,
        created_at=team.created_at,
        updated_at=team.updated_at,
    )


@router.get("/", response_model=TeamsListResponse)
async def get_user_teams(
    current_user: User = Depends(get_current_active_user),
    skip: int = 0,
    limit: int = 100,
    tournament_id: TenantId = Depends(get_tenant),
):
    """
    Get the teams the current user created in this tournament
    """
    mine = scoped(Team, tournament_id).find(Team.user_id == current_user.id)
    teams = await mine.sort("-created_at").skip(skip).limit(limit).to_list()

    total = (
        await scoped(Team, tournament_id).find(Team.user_id == current_user.id).count()
    )

    team_responses = [
        TeamResponse(
            id=str(team.id),
            user_id=str(team.user_id),
            team_name=team.team_name,
            player_ids=team.player_ids,
            captain_id=team.captain_id,
            vice_captain_id=team.vice_captain_id,
            total_points=team.total_points,
            total_value=team.total_value,
            rank=team.rank,
            rank_change=team.rank_change,
            contest_id=team.contest_id,
            created_at=team.created_at,
            updated_at=team.updated_at,
        )
        for team in teams
    ]

    return TeamsListResponse(teams=team_responses, total=total)


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    team_id: str,
    current_user: User = Depends(get_current_active_user),
    tournament_id: TenantId = Depends(get_tenant),
):
    """
    Get a specific team by ID
    """
    team = await get_scoped(Team, tournament_id, team_id)

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Team not found"
        )

    # Check if the team belongs to the current user
    if team.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this team",
        )

    return TeamResponse(
        id=str(team.id),
        user_id=str(team.user_id),
        team_name=team.team_name,
        player_ids=team.player_ids,
        captain_id=team.captain_id,
        vice_captain_id=team.vice_captain_id,
        total_points=team.total_points,
        total_value=team.total_value,
        rank=team.rank,
        rank_change=team.rank_change,
        contest_id=team.contest_id,
        created_at=team.created_at,
        updated_at=team.updated_at,
    )


@router.put("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    team_data: TeamUpdate,
    current_user: User = Depends(get_current_active_user),
    tournament_id: TenantId = Depends(get_tenant),
):
    """
    Update a team
    """
    team = await get_scoped(Team, tournament_id, team_id)

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Team not found"
        )

    # Check if the team belongs to the current user
    if team.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this team",
        )

    # Lock edits only if team is enrolled in a contest that is currently ongoing
    active_enrs = (
        await scoped(TeamContestEnrollment, tournament_id)
        .find(
            {
                "team_id": team.id,
                "status": "active",
            }
        )
        .to_list()
    )
    if active_enrs:
        contest_ids = [enr.contest_id for enr in active_enrs]
        now = utc_now()
        active_contest_count = (
            await scoped(Contest, tournament_id)
            .find(
                {
                    "_id": {"$in": contest_ids},
                    "status": {"$ne": ContestStatus.ARCHIVED},
                    "start_at": {"$lte": now},
                    "end_at": {"$gt": now},
                }
            )
            .count()
        )
        if active_contest_count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Team is locked due to an active contest. Try again when the contest is paused/off.",
            )

    # Update fields
    update_data = team_data.model_dump(exclude_unset=True)

    if update_data:
        # Validate captain/vice-captain if being updated
        if (
            "player_ids" in update_data
            or "captain_id" in update_data
            or "vice_captain_id" in update_data
        ):
            player_ids = update_data.get("player_ids", team.player_ids)
            captain_id = update_data.get("captain_id", team.captain_id)
            vice_captain_id = update_data.get("vice_captain_id", team.vice_captain_id)

            if captain_id and captain_id not in player_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Captain must be one of the selected players",
                )

            if vice_captain_id and vice_captain_id not in player_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Vice-captain must be one of the selected players",
                )

            if captain_id and vice_captain_id and captain_id == vice_captain_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Captain and vice-captain must be different players",
                )

            # Recalculate total value and re-validate the squad if players changed
            if "player_ids" in update_data:
                contest = await _resolve_contest(
                    team.contest_id, tournament_id=tournament_id
                )
                players = await _load_squad_players(
                    player_ids, tournament_id=tournament_id
                )
                update_data["total_value"] = await validate_squad_for_contest(
                    players, contest, len(player_ids), tournament_id=tournament_id
                )

        update_data["updated_at"] = utc_now()

        for key, value in update_data.items():
            setattr(team, key, value)

        await team.save()  # type: ignore[misc]

    return TeamResponse(
        id=str(team.id),
        user_id=str(team.user_id),
        team_name=team.team_name,
        player_ids=team.player_ids,
        captain_id=team.captain_id,
        vice_captain_id=team.vice_captain_id,
        total_points=team.total_points,
        total_value=team.total_value,
        rank=team.rank,
        rank_change=team.rank_change,
        contest_id=team.contest_id,
        created_at=team.created_at,
        updated_at=team.updated_at,
    )


@router.patch("/{team_id}/rename", response_model=TeamResponse)
async def rename_team(
    team_id: str,
    team_name: str,
    current_user: User = Depends(get_current_active_user),
    tournament_id: TenantId = Depends(get_tenant),
):
    """
    Rename a team
    """
    if not team_name or len(team_name.strip()) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Team name cannot be empty"
        )

    if len(team_name) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team name cannot exceed 100 characters",
        )

    team = await get_scoped(Team, tournament_id, team_id)

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Team not found"
        )

    # Check if the team belongs to the current user
    if team.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to rename this team",
        )

    # Lock edits only if team is enrolled in a contest that is currently ongoing
    active_enrs = (
        await scoped(TeamContestEnrollment, tournament_id)
        .find(
            {
                "team_id": team.id,
                "status": "active",
            }
        )
        .to_list()
    )
    if active_enrs:
        contest_ids = [enr.contest_id for enr in active_enrs]
        now = utc_now()
        active_contest_count = (
            await scoped(Contest, tournament_id)
            .find(
                {
                    "_id": {"$in": contest_ids},
                    "status": "ongoing",
                    "start_at": {"$lte": now},
                    "end_at": {"$gt": now},
                }
            )
            .count()
        )
        if active_contest_count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Team is locked due to an active contest. Try again when the contest is paused/off.",
            )

    # Update team name
    team.team_name = team_name.strip()
    team.updated_at = utc_now()
    await team.save()  # type: ignore[misc]

    return TeamResponse(
        id=str(team.id),
        user_id=str(team.user_id),
        team_name=team.team_name,
        player_ids=team.player_ids,
        captain_id=team.captain_id,
        vice_captain_id=team.vice_captain_id,
        total_points=team.total_points,
        total_value=team.total_value,
        rank=team.rank,
        rank_change=team.rank_change,
        contest_id=team.contest_id,
        created_at=team.created_at,
        updated_at=team.updated_at,
    )


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: str,
    current_user: User = Depends(get_current_active_user),
    tournament_id: TenantId = Depends(get_tenant),
):
    """
    Delete a team
    """
    team = await get_scoped(Team, tournament_id, team_id)

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Team not found"
        )

    # Check if the team belongs to the current user
    if team.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this team",
        )

    # Soft-remove any active enrollments for this team to keep referential consistency
    active_enrollments = (
        await scoped(TeamContestEnrollment, tournament_id)
        .find(
            {
                "team_id": team.id,
                "status": "active",
            }
        )
        .to_list()
    )

    if active_enrollments:
        now = utc_now()
        for enr in active_enrollments:
            enr.status = EnrollmentStatus.REMOVED
            enr.removed_at = now
            await enr.save()  # type: ignore[misc]

    await team.delete()  # type: ignore[misc]

    return None
