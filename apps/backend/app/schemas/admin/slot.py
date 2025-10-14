from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SlotBase(BaseModel):
    code: str = Field(..., pattern=r"^[A-Z0-9_-]+$", min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=100)
    min_select: int = Field(default=4, ge=0)
    max_select: int = Field(default=4, ge=0)
    description: Optional[str] = None
    requirements: Optional[dict] = None


class SlotCreate(SlotBase):
    pass


class SlotUpdate(BaseModel):
    # code is immutable and cannot be changed
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    min_select: Optional[int] = Field(None, ge=0)
    max_select: Optional[int] = Field(None, ge=0)
    description: Optional[str] = None
    requirements: Optional[dict] = None


class SlotResponse(BaseModel):
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

    class Config:
        from_attributes = True


class SlotListResponse(BaseModel):
    slots: list[SlotResponse]
    total: int
    page: int
    page_size: int
