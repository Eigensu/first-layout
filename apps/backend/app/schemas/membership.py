from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator

from app.utils.timezone import to_ist


class _DatesInIST(BaseModel):
    # Mongo hands dates back without a zone, which a browser reads as local
    # time. With the offset on, they mean one instant everywhere.
    @field_validator("*", mode="before")
    @classmethod
    def ensure_ist(cls, v):
        if isinstance(v, datetime):
            return to_ist(v)
        return v


class PlayedTournament(_DatesInIST):
    """A tournament this account made a team or entered a contest in."""

    slug: str
    name: str
    logo_url: Optional[str] = None
    status: str
    # The name they played under there, which need not be their username now.
    display_name: str
    joined_at: datetime
    first_played_at: Optional[datetime] = None
    last_active_at: Optional[datetime] = None
    # From the stats job, so up to a refresh behind while a tournament is live.
    teams_count: int
    contests_count: int
    best_rank: Optional[int] = None
    total_points: float


class RegisteredTournament(_DatesInIST):
    """A tournament this account joined without ever playing."""

    slug: str
    name: str
    logo_url: Optional[str] = None
    status: str
    joined_at: datetime


class MyTournamentsResponse(BaseModel):
    """GET /api/users/me/tournaments (spec §6.1), most recent first."""

    played: List[PlayedTournament]
    registered_only: List[RegisteredTournament]
