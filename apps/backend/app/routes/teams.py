from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Dict, Optional
from beanie import PydanticObjectId
from datetime import datetime

from app.models.team import Team
from app.models.player import Player
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.contest import Contest
from app.models.user import User
from app.schemas.team import TeamCreate, TeamUpdate, TeamResponse, TeamsListResponse
from app.utils.dependencies import get_current_active_user
from app.models.admin.slot import Slot
from app.services.contest_status import compute_contest_status
from app.common.enums.contests import ContestStatus
from app.common.enums.enrollments import EnrollmentStatus
from app.utils.timezone import now_ist

router = APIRouter(prefix="/api/teams", tags=["teams"])


async def _get_dynamic_max_players_from_slots() -> Optional[int]:
    """Compute maximum team size from slot configuration using total min_select."""
    slots = await Slot.find_all().to_list()
    if not slots:
        return None
    return sum(max(0, slot.min_select) for slot in slots)


@router.post("/", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    team_data: TeamCreate,
    current_user: User = Depends(get_current_active_user)
):
    """
    Create a new fantasy team for the current user
    """
    # Validate that captain and vice-captain are in the player list
    max_players_allowed = await _get_dynamic_max_players_from_slots()
    if max_players_allowed is not None and len(team_data.player_ids) > max_players_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {max_players_allowed} players allowed",
        )

    if team_data.captain_id not in team_data.player_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captain must be one of the selected players"
        )
    
    if team_data.vice_captain_id not in team_data.player_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vice-captain must be one of the selected players"
        )
    
    if team_data.captain_id == team_data.vice_captain_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captain and vice-captain must be different players"
        )
    
    # Calculate total value of the team
    # Convert string IDs to PydanticObjectId
    player_object_ids = []
    for pid in team_data.player_ids:
        try:
            player_object_ids.append(PydanticObjectId(pid))
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid player ID: {pid}"
            )
    
    players = await Player.find({"_id": {"$in": player_object_ids}}).to_list()
    total_value = sum(player.price for player in players)
    
    # Verify all player IDs are valid
    if len(players) != len(team_data.player_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Some player IDs are invalid"
        )

    # Enforce per-slot constraints
    # Count players per slot (ignore players without a slot)
    slot_counts: Dict[str, int] = {}
    for p in players:
        if p.slot:
            slot_counts[p.slot] = slot_counts.get(p.slot, 0) + 1

    # Build validation set: slots present in selection + all slots with min_select > 0
    present_slot_ids = list(slot_counts.keys())
    present_slot_oids = []
    for sid in present_slot_ids:
        try:
            present_slot_oids.append(PydanticObjectId(sid))
        except Exception:
            # If slot id is malformed, skip; it won't be validated
            continue
    slots_present = await Slot.find({"_id": {"$in": present_slot_oids}}).to_list() if present_slot_oids else []
    slots_with_min = await Slot.find(Slot.min_select > 0).to_list()

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
                    "expected": {"min_select": slot.min_select, "max_select": slot.max_select},
                    "actual": count,
                }
            )
    if violations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Team violates per-slot selection constraints",
                "violations": violations,
            },
        )

    # If tied to a contest, enforce allowed teams for daily contests
    if team_data.contest_id:
        try:
            contest = await Contest.get(PydanticObjectId(team_data.contest_id))
        except Exception:
            contest = None
        if not contest:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid contest_id")

        # Prevent joining an ongoing contest.
        computed_status = compute_contest_status(contest)
        if computed_status == ContestStatus.ONGOING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot create a team for an ongoing contest.",
            )

        if contest.contest_type == "daily" and contest.allowed_teams:
            disallowed = [p.name for p in players if p.team and p.team not in contest.allowed_teams]
            if disallowed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "message": "Selected players include teams disallowed for this daily contest",
                        "disallowed_players": disallowed,
                        "allowed_teams": contest.allowed_teams,
                    },
                )
    
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user is invalid"
        )

    if team_data.contest_id:
        existing_contest_team = await Team.find_one(
            Team.user_id == user_id,
            Team.contest_id == team_data.contest_id
        )
        if existing_contest_team:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You can create only one team per contest"
            )

    # Create team document
    team = Team(
        user_id=user_id,
        team_name=team_data.team_name,
        player_ids=team_data.player_ids,
        captain_id=team_data.captain_id,
        vice_captain_id=team_data.vice_captain_id,
        total_value=total_value,
        contest_id=team_data.contest_id
    )
    
    await team.insert()  # type: ignore[misc]
    
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
        updated_at=team.updated_at
    )


@router.get("/", response_model=TeamsListResponse)
async def get_user_teams(
    current_user: User = Depends(get_current_active_user),
    skip: int = 0,
    limit: int = 100
):
    """
    Get all teams created by the current user
    """
    teams = await Team.find(
        Team.user_id == current_user.id
    ).sort("-created_at").skip(skip).limit(limit).to_list()
    
    total = await Team.find(Team.user_id == current_user.id).count()
    
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
            updated_at=team.updated_at
        )
        for team in teams
    ]
    
    return TeamsListResponse(teams=team_responses, total=total)


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    team_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Get a specific team by ID
    """
    try:
        team = await Team.get(PydanticObjectId(team_id))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )
    
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )
    
    # Check if the team belongs to the current user
    if team.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this team"
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
        updated_at=team.updated_at
    )


@router.put("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    team_data: TeamUpdate,
    current_user: User = Depends(get_current_active_user)
):
    """
    Update a team
    """
    try:
        team = await Team.get(PydanticObjectId(team_id))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )
    
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )
    
    # Check if the team belongs to the current user
    if team.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this team"
        )
    
    # Lock edits only if team is enrolled in a contest that is currently ongoing
    active_enrs = await TeamContestEnrollment.find({
        "team_id": team.id,
        "status": "active",
    }).to_list()
    if active_enrs:
        contest_ids = [enr.contest_id for enr in active_enrs]
        now = now_ist()
        active_contest_count = await Contest.find({
            "_id": {"$in": contest_ids},
            "status": {"$ne": ContestStatus.ARCHIVED},
            "start_at": {"$lte": now},
            "end_at": {"$gt": now},
        }).count()
        if active_contest_count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Team is locked due to an active contest. Try again when the contest is paused/off.",
            )
    
    # Update fields
    update_data = team_data.model_dump(exclude_unset=True)
    
    if update_data:
        # Validate captain/vice-captain if being updated
        if "player_ids" in update_data or "captain_id" in update_data or "vice_captain_id" in update_data:
            player_ids = update_data.get("player_ids", team.player_ids)
            captain_id = update_data.get("captain_id", team.captain_id)
            vice_captain_id = update_data.get("vice_captain_id", team.vice_captain_id)
            
            if captain_id and captain_id not in player_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Captain must be one of the selected players"
                )
            
            if vice_captain_id and vice_captain_id not in player_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Vice-captain must be one of the selected players"
                )
            
            if captain_id and vice_captain_id and captain_id == vice_captain_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Captain and vice-captain must be different players"
                )
            
            # Recalculate total value and validate per-slot constraints if player_ids changed
            if "player_ids" in update_data:
                max_players_allowed = await _get_dynamic_max_players_from_slots()
                if max_players_allowed is not None and len(player_ids) > max_players_allowed:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Maximum {max_players_allowed} players allowed",
                    )

                # Convert string IDs to PydanticObjectId
                player_object_ids = []
                for pid in player_ids:
                    try:
                        player_object_ids.append(PydanticObjectId(pid))
                    except Exception:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid player ID: {pid}"
                        )
                players = await Player.find({"_id": {"$in": player_object_ids}}).to_list()
                update_data["total_value"] = sum(player.price for player in players)

                # If team belongs to a daily contest with restrictions, enforce allowed teams
                if team.contest_id:
                    try:
                        contest = await Contest.get(PydanticObjectId(team.contest_id))
                    except Exception:
                        contest = None
                    if contest and contest.contest_type == "daily" and contest.allowed_teams:
                        disallowed = [p.name for p in players if p.team and p.team not in contest.allowed_teams]
                        if disallowed:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail={
                                    "message": "Selected players include teams disallowed for this daily contest",
                                    "disallowed_players": disallowed,
                                    "allowed_teams": contest.allowed_teams,
                                },
                            )

                # Per-slot constraints validation (same as create)
                slot_counts: Dict[str, int] = {}
                for p in players:
                    if p.slot:
                        slot_counts[p.slot] = slot_counts.get(p.slot, 0) + 1
                present_slot_ids = list(slot_counts.keys())
                present_slot_oids = []
                for sid in present_slot_ids:
                    try:
                        present_slot_oids.append(PydanticObjectId(sid))
                    except Exception:
                        continue
                slots_present = await Slot.find({"_id": {"$in": present_slot_oids}}).to_list() if present_slot_oids else []
                slots_with_min = await Slot.find(Slot.min_select > 0).to_list()

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
                                "expected": {"min_select": slot.min_select, "max_select": slot.max_select},
                                "actual": count,
                            }
                        )
                if violations:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "message": "Team violates per-slot selection constraints",
                            "violations": violations,
                        },
                    )
        
        update_data["updated_at"] = datetime.utcnow()
        
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
        updated_at=team.updated_at
    )


@router.patch("/{team_id}/rename", response_model=TeamResponse)
async def rename_team(
    team_id: str,
    team_name: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Rename a team
    """
    if not team_name or len(team_name.strip()) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team name cannot be empty"
        )
    
    if len(team_name) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team name cannot exceed 100 characters"
        )
    
    try:
        team = await Team.get(PydanticObjectId(team_id))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )
    
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )
    
    # Check if the team belongs to the current user
    if team.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to rename this team"
        )
    
    # Lock edits only if team is enrolled in a contest that is currently ongoing
    active_enrs = await TeamContestEnrollment.find({
        "team_id": team.id,
        "status": "active",
    }).to_list()
    if active_enrs:
        from datetime import datetime as _dt
        contest_ids = [enr.contest_id for enr in active_enrs]
        now = _dt.utcnow()
        active_contest_count = await Contest.find({
            "_id": {"$in": contest_ids},
            "status": "ongoing",
            "start_at": {"$lte": now},
            "end_at": {"$gt": now},
        }).count()
        if active_contest_count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Team is locked due to an active contest. Try again when the contest is paused/off.",
            )
    
    # Update team name
    team.team_name = team_name.strip()
    team.updated_at = datetime.utcnow()
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
        updated_at=team.updated_at
    )


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Delete a team
    """
    try:
        team = await Team.get(PydanticObjectId(team_id))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )
    
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )
    
    # Check if the team belongs to the current user
    if team.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this team"
        )
    
    # Soft-remove any active enrollments for this team to keep referential consistency
    active_enrollments = await TeamContestEnrollment.find({
        "team_id": team.id,
        "status": "active",
    }).to_list()

    if active_enrollments:
        now = datetime.utcnow()
        for enr in active_enrollments:
            enr.status = EnrollmentStatus.REMOVED
            enr.removed_at = now
            await enr.save()  # type: ignore[misc]

    await team.delete()  # type: ignore[misc]
    
    return None
