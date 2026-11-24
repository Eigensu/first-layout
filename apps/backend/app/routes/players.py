from typing import List, Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.contest import Contest
from app.models.player import Player
from app.schemas.player import PlayerOut
from app.services.auction import ACTIVE_STATUS, uses_purse
from app.utils.tenant import TenantId, get_scoped, get_tenant, scoped

router = APIRouter(prefix="/api/players", tags=["players"])


def serialize_player(player: Player) -> PlayerOut:
    """Convert Player model to PlayerOut schema"""
    return PlayerOut(
        id=str(player.id),
        name=player.name,
        team=player.team,
        price=player.price,
        slot=player.slot,
        points=player.points,
        is_available=player.is_available,
        stats=player.stats,
        form=player.form,
        injury_status=player.injury_status,
        image_url=player.image_url,
        created_at=player.created_at,
    )


@router.get("", response_model=List[PlayerOut])
async def list_players(
    slot: Optional[str] = Query(
        None, description="Filter players by Slot ObjectId string"
    ),
    contest_id: Optional[str] = Query(
        None, description="If provided, filter by allowed teams for daily contest"
    ),
    ids: Optional[str] = Query(
        None,
        description=(
            "Comma-separated player ids. Only these players are returned, and "
            "only if they pass the other filters (contest_id included)."
        ),
    ),
    limit: int = Query(1000, ge=1, le=5000),
    skip: int = Query(0, ge=0),
    tournament_id: TenantId = Depends(get_tenant),
):
    """Get list of players with optional filtering by slot (ObjectId string)."""
    query = {}
    if slot is not None:
        query = {"slot": str(slot)}
    # If contest_id provided and contest is daily with restrictions, apply allowed team filter
    if contest_id:
        contest = await get_scoped(Contest, tournament_id, contest_id)
        if contest and contest.contest_type == "daily" and contest.allowed_teams:
            # add team in allowed_teams filter together with slot if present
            team_filter = {"team": {"$in": contest.allowed_teams}}
            if query:
                query = {"$and": [query, team_filter]}
            else:
                query = team_filter

        # A purse contest's pool (auction or slot_purse) is only the players
        # who were actually auctioned; anyone left at the unset price is not
        # selectable.
        if uses_purse(contest):
            eligibility_filter = {
                "price": {"$gt": 0},
                "$or": [{"status": ACTIVE_STATUS}, {"status": None}],
            }
            query = (
                {"$and": [query, eligibility_filter]} if query else eligibility_filter
            )

    if ids is not None:
        # Lets a client ask which squad members a contest's pool still offers,
        # whatever the pool's size. Malformed ids simply match nothing.
        wanted = []
        for raw in ids.split(","):
            try:
                wanted.append(PydanticObjectId(raw.strip()))
            except Exception:
                continue
        id_filter = {"_id": {"$in": wanted}}
        query = {"$and": [query, id_filter]} if query else id_filter

    players = (
        await scoped(Player, tournament_id)
        .find(query)
        .sort("+name")
        .skip(skip)
        .limit(limit)
        .to_list()
    )
    return [serialize_player(player) for player in players]


@router.get("/{id}", response_model=PlayerOut)
async def get_player(id: str, tournament_id: TenantId = Depends(get_tenant)):
    try:
        PydanticObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid player ID")
    player = await get_scoped(Player, tournament_id, id)

    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    return serialize_player(player)
