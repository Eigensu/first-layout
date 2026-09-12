from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SlotPublic(BaseModel):
    id: str
    code: str
    name: str
    min_select: int
    max_select: int
    description: Optional[str] = None
    requirements: Optional[dict] = None
    player_count: int = 0
    created_at: datetime
    updated_at: datetime


class SlotListPublic(BaseModel):
    slots: list[SlotPublic]
    total: int
