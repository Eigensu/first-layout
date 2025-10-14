from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from beanie.operators import RegEx, Or, And
from datetime import datetime

from app.models.admin.player import Player
from app.schemas.admin.player import (
    PlayerCreate,
    PlayerUpdate,
    PlayerResponse,
    PlayerListResponse,
)
from app.utils.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/admin/players", tags=["Admin - Players"])


@router.get("", response_model=PlayerListResponse)
async def get_players(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search by name or team"),
    role: Optional[str] = Query(None, description="Filter by role"),
    status: Optional[str] = Query(None, description="Filter by status"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
    current_user: User = Depends(get_current_user),
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
    
    if role:
        query_conditions.append(Player.role == role)
    
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
            role=player.role,
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
    current_user: User = Depends(get_current_user),
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
        role=player.role,
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
    current_user: User = Depends(get_current_user),
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
        role=player_data.role,
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
        role=player.role,
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
    current_user: User = Depends(get_current_user),
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
    
    return PlayerResponse(
        id=str(player.id),
        name=player.name,
        team=player.team,
        role=player.role,
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
    current_user: User = Depends(get_current_user),
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
