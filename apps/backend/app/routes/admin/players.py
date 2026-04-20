from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from beanie.operators import RegEx, Or, And
from datetime import datetime

from app.models.admin.player import Player
from app.models.team import Team
from app.models.player import Player as PublicPlayer
from app.models.player_contest_points import PlayerContestPoints
from beanie import PydanticObjectId
from app.schemas.admin.player import (
    PlayerCreate,
    PlayerUpdate,
    PlayerResponse,
    PlayerListResponse,
)
from app.utils.dependencies import get_admin_user
from app.models.user import User

router = APIRouter(prefix="/api/admin/players", tags=["Admin - Players"])


@router.delete("/bulk/all")
async def delete_all_players(
    confirm: str = Query(
        ..., description="Safety confirmation phrase. Must be DELETE_ALL_PLAYERS"
    ),
    _current_user: User = Depends(get_admin_user),
):
    """Delete all players with strict safety confirmation and team cleanup."""
    if confirm != "DELETE_ALL_PLAYERS":
        raise HTTPException(
            status_code=400,
            detail="Invalid confirmation phrase. Use DELETE_ALL_PLAYERS",
        )

    existing_players = await Player.find_all().count()

    # Clear team references to removed players to keep data consistent.
    team_update = await Team.find_all().update_many(
        {
            "$set": {
                "player_ids": [],
                "captain_id": None,
                "vice_captain_id": None,
                "total_points": 0.0,
                "total_value": 0.0,
                "updated_at": datetime.utcnow(),
            }
        }
    )

    # Remove contest points as they are tied to players that are being deleted.
    contest_points_deleted = await PlayerContestPoints.find_all().delete()
    players_deleted = await Player.find_all().delete()

    return {
        "message": "All players deleted successfully",
        "players_before": existing_players,
        "players_deleted": int(players_deleted or 0),
        "contest_points_deleted": int(contest_points_deleted or 0),
        "teams_cleared": int(getattr(team_update, "modified_count", 0) or 0),
    }


@router.get("", response_model=PlayerListResponse)
async def get_players(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search by name or team"),
    status: Optional[str] = Query(None, description="Filter by status"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
    _current_user: User = Depends(get_admin_user),
):
    """
    Get all players with pagination, search, and filters.
    Requires authentication.
    """
    # Build query
    query_conditions = []

    if search:
        query_conditions.append(
            Or(
                RegEx(Player.name, search, options="i"),
                RegEx(Player.team, search, options="i"),
            )
        )

    if status:
        query_conditions.append(Player.status == status)

    # Execute query with filters
    if query_conditions:
        query = Player.find(And(*query_conditions))
    else:
        query = Player.find_all()

    # Get total count
    total = await query.count()

    # Apply sorting
    sort_direction = -1 if sort_order == "desc" else 1
    query = query.sort((sort_by, sort_direction))

    # Apply pagination
    skip = (page - 1) * page_size
    players = await query.skip(skip).limit(page_size).to_list()

    # Convert to response format
    player_responses = [
        PlayerResponse(
            id=str(player.id),
            name=player.name,
            team=player.team,
            points=player.points,
            status=player.status,
            price=player.price,
            slot=player.slot,
            image_url=player.image_url,
            stats=player.stats,
            created_at=player.created_at,
            updated_at=player.updated_at,
        )
        for player in players
    ]

    return PlayerListResponse(
        players=player_responses,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{player_id}", response_model=PlayerResponse)
async def get_player(
    player_id: str,
    _current_user: User = Depends(get_admin_user),
):
    """
    Get a specific player by ID.
    Requires authentication.
    """
    player = await Player.get(player_id)

    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    return PlayerResponse(
        id=str(player.id),
        name=player.name,
        team=player.team,
        points=player.points,
        status=player.status,
        price=player.price,
        slot=player.slot,
        image_url=player.image_url,
        stats=player.stats,
        created_at=player.created_at,
        updated_at=player.updated_at,
    )


@router.post("", response_model=PlayerResponse, status_code=201)
async def create_player(
    player_data: PlayerCreate,
    _current_user: User = Depends(get_admin_user),
):
    """
    Create a new player.
    Requires authentication.
    """
    # Check if player with same name already exists
    existing_player = await Player.find_one(Player.name == player_data.name)
    if existing_player:
        raise HTTPException(
            status_code=400,
            detail=f"Player with name '{player_data.name}' already exists",
        )

    # Create player
    player = Player(
        name=player_data.name,
        team=player_data.team,
        points=player_data.points,
        status=player_data.status,
        price=player_data.price,
        slot=player_data.slot,
        image_url=player_data.image_url,
        stats=player_data.stats,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    await player.insert()

    return PlayerResponse(
        id=str(player.id),
        name=player.name,
        team=player.team,
        points=player.points,
        status=player.status,
        price=player.price,
        slot=player.slot,
        image_url=player.image_url,
        stats=player.stats,
        created_at=player.created_at,
        updated_at=player.updated_at,
    )


@router.put("/{player_id}", response_model=PlayerResponse)
async def update_player(
    player_id: str,
    player_data: PlayerUpdate,
    _current_user: User = Depends(get_admin_user),
):
    """
    Update a player.
    Requires authentication.
    """
    player = await Player.get(player_id)

    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    # Update only provided fields
    update_data = player_data.model_dump(exclude_unset=True)

    if update_data:
        for field, value in update_data.items():
            setattr(player, field, value)

        player.updated_at = datetime.utcnow()
        await player.save()

        # If points changed, recompute totals for all impacted teams
        if "points" in update_data:
            # Teams store player_ids as strings of ObjectId
            impacted_teams = await Team.find({"player_ids": player_id}).to_list()

            # Collect all needed player ObjectIds in one pass
            all_player_ids = set()
            team_player_ids_map = {}
            for team in impacted_teams:
                player_object_ids = []
                for pid in team.player_ids:
                    try:
                        obj_id = PydanticObjectId(pid)
                        player_object_ids.append(obj_id)
                        all_player_ids.add(obj_id)
                    except (TypeError, ValueError):
                        continue
                team_player_ids_map[team.id] = player_object_ids

            # Fetch all players needed across all teams in a single query
            players = []
            if all_player_ids:
                players = await PublicPlayer.find(
                    {"_id": {"$in": list(all_player_ids)}}
                ).to_list()

            # Build lookup of player -> points
            player_points_map = {p.id: float(p.points or 0.0) for p in players}

            # Update each team's total using the pre-fetched points
            for team in impacted_teams:
                player_object_ids = team_player_ids_map.get(team.id, [])
                total = sum(
                    player_points_map.get(obj_id, 0.0) for obj_id in player_object_ids
                )
                team.total_points = total
                team.updated_at = datetime.utcnow()
                await team.save()

    return PlayerResponse(
        id=str(player.id),
        name=player.name,
        team=player.team,
        points=player.points,
        status=player.status,
        price=player.price,
        slot=player.slot,
        image_url=player.image_url,
        stats=player.stats,
        created_at=player.created_at,
        updated_at=player.updated_at,
    )


@router.delete("/{player_id}", status_code=204)
async def delete_player(
    player_id: str,
    _current_user: User = Depends(get_admin_user),
):
    """
    Delete a player.
    Requires authentication.
    """
    player = await Player.get(player_id)

    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    await player.delete()

    return None
