from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.player import PlayerOut


class PlayerHot(BaseModel):
    player: PlayerOut
    selection_count: int = Field(ge=0)
    is_hot: bool


class PlayerHotIds(BaseModel):
    player_ids: List[str]
    threshold: int


class PlayerHotSingle(BaseModel):
    player_id: str
    selection_count_global: int
    is_hot_global: bool
    selection_count_contest: Optional[int] = None
    is_hot_contest: Optional[bool] = None
