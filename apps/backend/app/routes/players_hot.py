from typing import List, Literal, Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, Query

from app.common.consts.index import HOT_PLAYER_TEAM_SELECTIONS_THRESHOLD
from app.models.player import Player
from app.schemas.player import PlayerOut
from app.schemas.player_hot import PlayerHot, PlayerHotIds, PlayerHotSingle
from app.services import hot_players as svc

router = APIRouter(prefix="/api/players", tags=["players", "hot"])


def _serialize_player(player: Player) -> PlayerOut:
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
        updated_at=player.updated_at,
    )


@router.get("/hot", response_model=List[PlayerHot])
async def list_hot_players(
    contest_id: Optional[str] = Query(None),
    threshold: Optional[int] = Query(None, ge=1),
    limit: int = Query(200, ge=1, le=1000),
    skip: int = Query(0, ge=0),
    sort: Literal["count_desc", "name_asc"] = Query("count_desc"),
):
    """List players with their selection counts and hot flag.

    If contest_id is provided, counts are computed among teams enrolled (active) in that contest.
    """
    thr = threshold or HOT_PLAYER_TEAM_SELECTIONS_THRESHOLD

    if contest_id:
        rows = await svc.aggregate_hot_in_contest(contest_id, skip=skip, limit=limit)
    else:
        rows = await svc.aggregate_hot_global(skip=skip, limit=limit)

    player_ids = [r["_id"] for r in rows if r.get("_id")]
    # Fetch Players in one query
    players = await Player.find(
        {"_id": {"$in": [PydanticObjectId(pid) for pid in player_ids if pid]}}
    ).to_list()
    players_by_id = {str(p.id): p for p in players}

    items: List[PlayerHot] = []
    for r in rows:
        pid = r.get("_id")
        if not pid:
            continue
        p = players_by_id.get(pid)
        if not p:
            # Player might be deleted; skip
            continue
        count = int(r.get("selection_count", 0))
        items.append(
            PlayerHot(
                player=_serialize_player(p),
                selection_count=count,
                is_hot=count >= thr,
            )
        )

    if sort == "name_asc":
        items.sort(key=lambda x: x.player.name.lower())

    return items


@router.get("/hot/ids", response_model=PlayerHotIds)
async def list_hot_player_ids(
    contest_id: Optional[str] = Query(None),
    threshold: Optional[int] = Query(None, ge=1),
    limit: int = Query(1000, ge=1, le=5000),
    skip: int = Query(0, ge=0),
):
    thr = threshold or HOT_PLAYER_TEAM_SELECTIONS_THRESHOLD
    if contest_id:
        rows = await svc.aggregate_hot_in_contest(contest_id, skip=skip, limit=limit)
    else:
        rows = await svc.aggregate_hot_global(skip=skip, limit=limit)

    ids = [
        str(r["_id"])
        for r in rows
        if int(r.get("selection_count", 0)) >= thr and r.get("_id")
    ]
    return PlayerHotIds(player_ids=ids, threshold=thr)


@router.get("/{player_id}/hot", response_model=PlayerHotSingle)
async def get_player_hot(
    player_id: str,
    contest_id: Optional[str] = Query(None),
    threshold: Optional[int] = Query(None, ge=1),
):
    thr = threshold or HOT_PLAYER_TEAM_SELECTIONS_THRESHOLD

    # Validate player exists
    try:
        p = await Player.get(PydanticObjectId(player_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid player ID")
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")

    global_count = await svc.count_global(player_id)
    result: PlayerHotSingle | None = PlayerHotSingle(
        player_id=player_id,
        selection_count_global=global_count,
        is_hot_global=global_count >= thr,
    )

    if contest_id:
        contest_count = await svc.count_in_contest(player_id, contest_id)
        result.selection_count_contest = contest_count
        result.is_hot_contest = contest_count >= thr

    return result
