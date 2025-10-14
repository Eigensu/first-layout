from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ContestBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: str = Field(default="Public", description="Public, Private")
    entry_fee: float = Field(default=0.0, ge=0)
    prize_pool: float = Field(default=0.0, ge=0)
    max_participants: int = Field(default=100, ge=1)
    start_date: datetime
    end_date: Optional[datetime] = None
    status: str = Field(default="Upcoming", description="Upcoming, Active, Completed, Cancelled")
    description: Optional[str] = None
    rules: Optional[dict] = None
    prize_distribution: Optional[dict] = None


class ContestCreate(ContestBase):
    pass


class ContestUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    type: Optional[str] = None
    entry_fee: Optional[float] = Field(None, ge=0)
    prize_pool: Optional[float] = Field(None, ge=0)
    max_participants: Optional[int] = Field(None, ge=1)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    description: Optional[str] = None
    rules: Optional[dict] = None
    prize_distribution: Optional[dict] = None


class ContestResponse(ContestBase):
    id: str
    participant_count: int
    is_full: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ContestListResponse(BaseModel):
    contests: list[ContestResponse]
    total: int
    page: int
    page_size: int
