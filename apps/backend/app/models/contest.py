from beanie import Document, Indexed
from pydantic import Field
from datetime import datetime
from typing import Optional, List
from app.common.enums.contests import ContestStatus, ContestVisibility, PointsScope, ContestType
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
