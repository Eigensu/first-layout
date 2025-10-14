from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class PlayerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    team: str = Field(..., min_length=1, max_length=100)
    role: str = Field(..., description="Batsman, Bowler, All-Rounder, Wicket-Keeper")
    points: float = Field(default=0.0, ge=0)
    status: str = Field(default="Active", description="Active, Inactive, Injured")
    price: float = Field(default=8.0, ge=0)
    slot: Optional[str] = None
    image_url: Optional[str] = None
    stats: Optional[dict] = None


class PlayerCreate(PlayerBase):
    pass


class PlayerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    team: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[str] = None
    points: Optional[float] = Field(None, ge=0)
    status: Optional[str] = None
    price: Optional[float] = Field(None, ge=0)
    slot: Optional[str] = None
    image_url: Optional[str] = None
    stats: Optional[dict] = None


class PlayerResponse(PlayerBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PlayerListResponse(BaseModel):
    players: list[PlayerResponse]
    total: int
    page: int
    page_size: int
