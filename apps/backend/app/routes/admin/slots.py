from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel
from beanie.operators import RegEx, Or, And
from beanie import PydanticObjectId

from app.models.admin.slot import Slot
from app.models.admin.player import Player as AdminPlayer
from app.schemas.admin.slot import (
    SlotCreate,
    SlotUpdate,
    SlotResponse,
    SlotListResponse,
)
from app.schemas.admin.player import (
    PlayerResponse,
    PlayerListResponse,
)
from app.utils.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/admin/slots", tags=["Admin - Slots"])


class PlayerIds(BaseModel):
    player_ids: List[str]


async def build_slot_response(slot: Slot) -> SlotResponse:
    player_count = await AdminPlayer.find(AdminPlayer.slot == str(slot.id)).count()
    return SlotResponse(
        id=str(slot.id),
        code=slot.code,
        name=slot.name,
        min_select=slot.min_select,
        max_select=slot.max_select,
        description=slot.description,
        requirements=slot.requirements,
        player_count=player_count,
        created_at=slot.created_at,
        updated_at=slot.updated_at,
    )


@router.get("", response_model=SlotListResponse)
async def get_slots(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search by code or name"),
    current_user: User = Depends(get_current_user),
):
    """List slots from the DB with computed player_count."""
    conditions = []
    if search:
        conditions.append(Or(RegEx(Slot.name, search, options="i"), RegEx(Slot.code, search, options="i")))

    if conditions:
        query = Slot.find(And(*conditions))
    else:
        query = Slot.find_all()

    total = await query.count()
    skip = (page - 1) * page_size
    slots = await query.skip(skip).limit(page_size).to_list()

    slot_responses = []
    for slot in slots:
        slot_responses.append(await build_slot_response(slot))

    return {
        "slots": slot_responses,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/migrate")
async def migrate_slots_from_players(
    dry_run: bool = Query(False, description="When true, does not write changes; returns a plan only."),
    current_user: User = Depends(get_current_user),
):
    """Backfill Slot documents from distinct AdminPlayer.slot values and normalize players to reference Slot ObjectIds.

    - Creates Slots with code `SLOT_<VALUE>` and name `Slot <VALUE>` for any non-ObjectId values.
    - Updates players whose `slot` equals the legacy value to the new Slot ObjectId string.
    - Returns a summary of created slots and updated players counts.
    """
    players_with_slots = await AdminPlayer.find(AdminPlayer.slot != None).to_list()
    legacy_values = set()
    for p in players_with_slots:
        if p.slot:
            legacy_values.add(p.slot)

    created = []
    updated_counts = {}

    for val in legacy_values:
        # If val matches an existing Slot id, prefer that
        slot_doc = None
        # Treat as id only if it's a valid ObjectId
        try:
            oid = PydanticObjectId(val)  # may raise
            slot_doc = await Slot.get(oid)
        except Exception:
            slot_doc = None
        if not slot_doc:
            # Create a new slot with code/name derived from legacy value if missing
            code = f"SLOT_{str(val).upper()}"
            name = f"Slot {val}"
            # Ensure uniqueness for code/name variants
            existing_by_code = await Slot.find_one(Slot.code == code)
            if existing_by_code:
                slot_doc = existing_by_code
            else:
                existing_by_name = await Slot.find_one(Slot.name == name)
                if existing_by_name:
                    slot_doc = existing_by_name
                else:
                    if not dry_run:
                        slot_doc = Slot(
                            code=code,
                            name=name,
                            min_select=4,
                            max_select=4,
                            created_at=datetime.utcnow(),
                            updated_at=datetime.utcnow(),
                        )
                        await slot_doc.insert()
                    created.append({"legacy": val, "code": code, "name": name})

        if slot_doc:
            # Normalize players pointing to this legacy value
            numeric_alt = None
            if isinstance(val, str) and val.isdigit():
                try:
                    numeric_alt = int(val)
                except Exception:
                    numeric_alt = None

            if not dry_run:
                conditions = [AdminPlayer.slot == val]
                if numeric_alt is not None:
                    conditions.append(AdminPlayer.slot == numeric_alt)
                query = AdminPlayer.find(Or(*conditions)) if len(conditions) > 1 else AdminPlayer.find(AdminPlayer.slot == val)
                players_to_update = await query.to_list()

                for p in players_to_update:
                    p.slot = str(slot_doc.id)
                    await p.save()
                updated_counts[str(val)] = len(players_to_update)
            else:
                conditions = [AdminPlayer.slot == val]
                if numeric_alt is not None:
                    conditions.append(AdminPlayer.slot == numeric_alt)
                query = AdminPlayer.find(Or(*conditions)) if len(conditions) > 1 else AdminPlayer.find(AdminPlayer.slot == val)
                count = await query.count()
                updated_counts[str(val)] = count

    return {
        "dry_run": dry_run,
        "created_slots": created,
        "normalized_players": updated_counts,
    }


@router.post("", response_model=SlotResponse, status_code=201)
async def create_slot(
    data: SlotCreate,
    current_user: User = Depends(get_current_user),
):
    """Create and persist a new slot."""
    if data.min_select is not None and data.max_select is not None and data.min_select > data.max_select:
        raise HTTPException(status_code=400, detail="min_select cannot be greater than max_select")

    # Uniqueness checks
    if await Slot.find_one(Slot.code == data.code):
        raise HTTPException(status_code=400, detail="Slot code already exists")
    if await Slot.find_one(Slot.name == data.name):
        raise HTTPException(status_code=400, detail="Slot name already exists")

    now = datetime.utcnow()
    slot = Slot(
        code=data.code,
        name=data.name,
        min_select=data.min_select,
        max_select=data.max_select,
        description=data.description,
        requirements=data.requirements,
        created_at=now,
        updated_at=now,
    )
    await slot.insert()
    return await build_slot_response(slot)


@router.get("/{slot_id}", response_model=SlotResponse)
async def get_slot(
    slot_id: str,
    current_user: User = Depends(get_current_user),
):
    slot = await Slot.get(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    return await build_slot_response(slot)


@router.put("/{slot_id}", response_model=SlotResponse)
async def update_slot(
    slot_id: str,
    data: SlotUpdate,
    current_user: User = Depends(get_current_user),
):
    slot = await Slot.get(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    # Validate min/max with existing values
    new_min = data.min_select if data.min_select is not None else slot.min_select
    new_max = data.max_select if data.max_select is not None else slot.max_select
    if new_min > new_max:
        raise HTTPException(status_code=400, detail="min_select cannot be greater than max_select")

    # Apply updates
    update_fields = data.model_dump(exclude_unset=True)
    if "code" in update_fields:
        update_fields.pop("code")  # code is immutable
    for k, v in update_fields.items():
        setattr(slot, k, v)
    slot.updated_at = datetime.utcnow()
    await slot.save()
    return await build_slot_response(slot)


@router.delete("/{slot_id}")
async def delete_slot(
    slot_id: str,
    force: bool = Query(False, description="Force delete: unassign players then delete"),
    current_user: User = Depends(get_current_user),
):
    """Delete a slot. By default blocks if players are assigned; with force=true unassigns all then deletes."""
    slot = await Slot.get(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    players_in_slot = await AdminPlayer.find(AdminPlayer.slot == slot_id).to_list()
    if players_in_slot and not force:
        raise HTTPException(status_code=409, detail="Slot has assigned players. Use force=true to unassign and delete.")

    unassigned = 0
    if players_in_slot:
        for player in players_in_slot:
            player.slot = None
            await player.save()
        unassigned = len(players_in_slot)

    await slot.delete()
    return {"message": "Slot successfully deleted", "unassigned_players": unassigned}


@router.get("/{slot_id}/players", response_model=PlayerListResponse)
async def get_slot_players(
    slot_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    team: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    slot = await Slot.get(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    conditions = [AdminPlayer.slot == slot_id]
    if search:
        conditions.append(RegEx(AdminPlayer.name, search, options="i"))
    if team:
        conditions.append(AdminPlayer.team == team)
    if role:
        conditions.append(AdminPlayer.role == role)

    query = AdminPlayer.find(And(*conditions)) if len(conditions) > 1 else AdminPlayer.find(AdminPlayer.slot == slot_id)
    total = await query.count()
    skip = (page - 1) * page_size
    players = await query.skip(skip).limit(page_size).to_list()

    return {
        "players": [
            PlayerResponse(
                id=str(p.id),
                name=p.name,
                team=p.team,
                role=p.role,
                points=p.points,
                status=p.status,
                price=p.price,
                slot=p.slot,
                image_url=p.image_url,
                stats=p.stats,
                created_at=p.created_at,
                updated_at=p.updated_at,
            ) for p in players
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/{slot_id}/players")
async def assign_players_to_slot(
    slot_id: str,
    body: PlayerIds,
    current_user: User = Depends(get_current_user),
):
    slot = await Slot.get(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    assigned = 0
    for pid in body.player_ids:
        player = await AdminPlayer.get(pid)
        if player:
            player.slot = str(slot.id)
            await player.save()
            assigned += 1
    return {"assigned": assigned}


@router.delete("/{slot_id}/players/{player_id}")
async def unassign_player_from_slot(
    slot_id: str,
    player_id: str,
    current_user: User = Depends(get_current_user),
):
    slot = await Slot.get(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    player = await AdminPlayer.get(player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    if player.slot != slot_id:
        return {"unassigned": 0}
    player.slot = None
    await player.save()
    return {"unassigned": 1}


@router.delete("/{slot_id}/players")
async def bulk_unassign_players_from_slot(
    slot_id: str,
    body: PlayerIds,
    current_user: User = Depends(get_current_user),
):
    slot = await Slot.get(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    count = 0
    for pid in body.player_ids:
        player = await AdminPlayer.get(pid)
        if player and player.slot == slot_id:
            player.slot = None
            await player.save()
            count += 1
    return {"unassigned": count}
