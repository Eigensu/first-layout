from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.dates import DatesInIST


class PlayedTournament(DatesInIST):
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
    # Counted when asked. best_rank and total_points come from the stats job,
    # so they can be a refresh behind while a tournament is live.
    teams_count: int
    contests_count: int
    best_rank: Optional[int] = None
    total_points: float


class RegisteredTournament(DatesInIST):
    """A tournament this account joined without ever playing."""

    slug: str
    name: str
    logo_url: Optional[str] = None
    status: str
    joined_at: datetime


class MyTournamentsTotals(BaseModel):
    """The whole account's numbers, summed over `played`, so every client shows
    the same totals rather than each adding them up its own way."""

    tournaments_played: int = 0
    teams_count: int = 0
    contests_count: int = 0


class MyTournamentsResponse(BaseModel):
    """GET /api/users/me/tournaments (spec §6.1), most recent first."""

    played: List[PlayedTournament]
    registered_only: List[RegisteredTournament]
    totals: MyTournamentsTotals
