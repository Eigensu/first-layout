from beanie import Document, Indexed
from pydantic import Field
from datetime import datetime
from typing import Optional, List
from app.common.enums.contests import (
    ContestStatus,
    ContestVisibility,
    PointsScope,
    ContestType,
    ContestFormat,
)
from app.utils.timezone import now_ist


class Contest(Document):
    """Contest document defining a competition window and metadata."""

    # immutable identifier for stable references
    code: Indexed(str, unique=True)  # type: ignore

    # human friendly name (mutable)
    name: str

    description: Optional[str] = None
    logo_url: Optional[str] = None
    logo_file_id: Optional[str] = None

    # time window
    start_at: datetime
    end_at: datetime

    # lifecycle and visibility
    status: ContestStatus = ContestStatus.LIVE
    visibility: ContestVisibility = ContestVisibility.PUBLIC

    # points calculation mode (phase 1 uses baseline; ledger can come later)
    points_scope: PointsScope = PointsScope.TIME_WINDOW

    # type of contest: daily or full tournament
    contest_type: ContestType = ContestType.FULL
    # list of allowed real-world team names (Player.team) for daily contests
    allowed_teams: List[str] = Field(default_factory=list)

    # how the squad is assembled; existing contests stay slot-based
    contest_format: ContestFormat = ContestFormat.SLOT_BASED
    # auction_purse only: points budget a participant may spend
    purse: float = Field(default=1_000_000.0, ge=0)
    # auction_purse only: exact number of players a squad must contain.
    # Slot-based contests derive squad size from Slot config instead.
    squad_size: Optional[int] = Field(default=None, ge=1)
    # per-contest override for GlobalSettings.max_players_per_team.
    # None means fall back to the global setting.
    max_players_per_team: Optional[int] = Field(default=None, ge=1)

    created_at: datetime = Field(default_factory=now_ist)
    updated_at: datetime = Field(default_factory=now_ist)

    class Settings:
        name = "contests"
        indexes = [
            "code",
            [("start_at", 1)],
            [("end_at", 1)],
            [("status", 1), ("start_at", -1)],
            [("contest_type", 1)],
        ]
