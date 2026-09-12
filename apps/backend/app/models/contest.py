from datetime import datetime
from typing import List, Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

from app.common.enums.contests import (
    ContestFormat,
    ContestStatus,
    ContestType,
    ContestVisibility,
    PointsScope,
)
from app.utils.timezone import now_ist


class Contest(Document):
    """Contest document defining a competition window and metadata."""

    # immutable identifier for stable references. Globally unique today; the
    # uniq_contest_code_per_tournament index below is what it becomes once the
    # legacy global index is dropped during the migration, so that two
    # tournaments can each have a contest called "FINAL".
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

    # Tenant scope -- see app/utils/tenant.py. Optional only until the
    # backfill fills it in; None means "written before the migration".
    tournament_id: Optional[PydanticObjectId] = None

    created_at: datetime = Field(default_factory=now_ist)
    updated_at: datetime = Field(default_factory=now_ist)

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
            # "FINAL" belongs to whoever is running a final. This sits
            # alongside the legacy global unique index on `code` until the
            # migration drops that one (docs/UNIFIED_AUTH_SPEC.md §7, Phase 3);
            # until then the stricter global constraint still applies.
            IndexModel(
                [("tournament_id", 1), ("code", 1)],
                unique=True,
                name="uniq_contest_code_per_tournament",
            ),
        ]
