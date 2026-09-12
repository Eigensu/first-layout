from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.admin.slot import Slot
from app.models.player import Player
from app.schemas.slot import SlotListPublic, SlotPublic

router = APIRouter(prefix="/api/slots", tags=["slots"])


def to_public(slot: Slot, player_count: int) -> SlotPublic:
    return SlotPublic(
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


@router.get("", response_model=SlotListPublic)
async def list_slots(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    total = await Slot.find_all().count()
    skip = (page - 1) * page_size
    slots = await Slot.find_all().skip(skip).limit(page_size).to_list()

    results: list[SlotPublic] = []
    for s in slots:
        cnt = await Player.find(Player.slot == str(s.id)).count()
        results.append(to_public(s, cnt))

    return {"slots": results, "total": total}


@router.get("/{slot_id}", response_model=SlotPublic)
async def get_slot(slot_id: str):
    slot = await Slot.get(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    cnt = await Player.find(Player.slot == str(slot.id)).count()
    return to_public(slot, cnt)
