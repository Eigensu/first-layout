from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from bson import ObjectId
from config.database import get_database
from app.schemas.player import PlayerOut

router = APIRouter(prefix="/api/players", tags=["players"])


def serialize_player(doc) -> PlayerOut:
    return PlayerOut(
        id=str(doc.get("_id")),
        name=doc.get("name", ""),
        team=doc.get("team"),
        role=doc.get("role"),
        price=doc.get("price", 0),
        slot=doc.get("slot", 0),
        points=doc.get("points", 0),
        is_available=doc.get("is_available", True),
        stats=doc.get("stats"),
        form=doc.get("form"),
        injury_status=doc.get("injury_status"),
        image_url=doc.get("image_url"),
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
    )


@router.get("", response_model=List[PlayerOut])
async def list_players(
    slot: Optional[int] = Query(None, ge=1, le=4),
    limit: int = Query(200, ge=1, le=1000),
    skip: int = Query(0, ge=0),
):
    db = get_database()
    query = {"slot": slot} if slot is not None else {}
    cursor = (
        db["players"].find(query).sort("name", 1).skip(skip).limit(limit)
    )
    docs = await cursor.to_list(length=limit)
    return [serialize_player(d) for d in docs]


@router.get("/{id}", response_model=PlayerOut)
async def get_player(id: str):
    db = get_database()
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    doc = await db["players"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Player not found")
    return serialize_player(doc)
