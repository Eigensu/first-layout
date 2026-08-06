from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List, Literal
from datetime import datetime
from app.utils.timezone import to_ist, IST


class ContestCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    logo_url: Optional[str] = None
    start_at: datetime
    end_at: datetime
    status: Literal["live", "ongoing", "completed", "archived"] = "live"
    visibility: Literal["public", "private"] = "public"
    points_scope: Literal["time_window", "snapshot"] = "time_window"
    contest_type: Literal["daily", "full"] = "full"
    # Allowed real-world team names (e.g., "IND", "AUS") for daily contests
    allowed_teams: List[str] = Field(default_factory=list)
    # Squad assembly format; independent of contest_type
    contest_format: Literal["slot_based", "auction_purse"] = "slot_based"
    purse: float = Field(default=1_000_000.0, ge=0)
    squad_size: Optional[int] = Field(default=None, ge=1)
    max_players_per_team: Optional[int] = Field(default=None, ge=1)

    @model_validator(mode='after')
    def require_squad_size_for_auction(self):
        if self.contest_format == "auction_purse" and self.squad_size is None:
            raise ValueError("squad_size is required when contest_format is auction_purse")
        return self

    @field_validator('start_at', 'end_at', mode='before')
    @classmethod
    def parse_as_ist(cls, v):
        """Parse datetime as IST if naive, preserve timezone if already set."""
        if isinstance(v, str):
            # Parse ISO string
            from datetime import datetime as dt
            parsed = dt.fromisoformat(v.replace('Z', '+00:00'))
            if parsed.tzinfo is None:
                # Treat naive datetime as IST (user's local time)
                return parsed.replace(tzinfo=IST)
            # Has timezone, convert to IST
            return parsed.astimezone(IST)
        if isinstance(v, datetime):
            if v.tzinfo is None:
                # Treat naive datetime as IST
                return v.replace(tzinfo=IST)
            # Has timezone, convert to IST
            return v.astimezone(IST)
        return v


class ContestUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    status: Optional[Literal["live", "ongoing", "completed", "archived"]] = None
    visibility: Optional[Literal["public", "private"]] = None
    points_scope: Optional[Literal["time_window", "snapshot"]] = None
    contest_type: Optional[Literal["daily", "full"]] = None
    allowed_teams: Optional[List[str]] = None
    contest_format: Optional[Literal["slot_based", "auction_purse"]] = None
    purse: Optional[float] = Field(default=None, ge=0)
    squad_size: Optional[int] = Field(default=None, ge=1)
    max_players_per_team: Optional[int] = Field(default=None, ge=1)

    @field_validator('start_at', 'end_at', mode='before')
    @classmethod
    def parse_as_ist(cls, v):
        """Parse datetime as IST if naive, preserve timezone if already set."""
        if isinstance(v, str):
            # Parse ISO string
            from datetime import datetime as dt
            parsed = dt.fromisoformat(v.replace('Z', '+00:00'))
            if parsed.tzinfo is None:
                # Treat naive datetime as IST (user's local time)
                return parsed.replace(tzinfo=IST)
            # Has timezone, convert to IST
            return parsed.astimezone(IST)
        if isinstance(v, datetime):
            if v.tzinfo is None:
                # Treat naive datetime as IST
                return v.replace(tzinfo=IST)
            # Has timezone, convert to IST
            return v.astimezone(IST)
        return v


class ContestResponse(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    logo_file_id: Optional[str] = None
    start_at: datetime
    end_at: datetime
    status: str
    visibility: str
    points_scope: str
    contest_type: str
    allowed_teams: List[str]
    contest_format: str
    purse: float
    squad_size: Optional[int] = None
    max_players_per_team: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    @field_validator('start_at', 'end_at', 'created_at', 'updated_at', mode='before')
    @classmethod
    def ensure_ist(cls, v):
        """Ensure all datetime fields are in IST timezone"""
        if isinstance(v, datetime):
            return to_ist(v)
        return v

    class Config:
        from_attributes = True


class ContestListResponse(BaseModel):
    contests: List[ContestResponse]
    total: int
    page: int
    page_size: int
