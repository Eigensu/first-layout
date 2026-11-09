from datetime import datetime
from typing import List, Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

from app.common.datetime_utils import utc_now
from app.common.enums.contests import (
    ContestFormat,
    ContestStatus,
    ContestType,
    ContestVisibility,
    PointsScope,
)


class Contest(Document):
    """Contest document defining a competition window and metadata."""

    # Immutable identifier for stable references, unique within its tournament
    # by uniq_contest_code_per_tournament below. There is no global unique
    # index: the field-level one this used to declare was shadowed by the
    # plain "code" entry in Settings.indexes and never built (spec §13.8, R22), so two
    # tournaments can each have a contest called "FINAL".
    code: str

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

    # Tenant scope -- see app/utils/tenant.py. Optional only until the
    # backfill fills it in; None means "written before the migration".
    tournament_id: Optional[PydanticObjectId] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "contests"
        indexes = [
            "tournament_id",
            "code",
            [("start_at", 1)],
            [("end_at", 1)],
            [("status", 1), ("start_at", -1)],
            [("contest_type", 1)],
            # A contest code only has to be unique within its tournament --
            # "FINAL" belongs to whoever is running a final.
            IndexModel(
                [("tournament_id", 1), ("code", 1)],
                unique=True,
                name="uniq_contest_code_per_tournament",
            ),
        ]
