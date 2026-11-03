from datetime import datetime
from typing import Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field


class PlayerContestPoints(Document):
    """Per-contest points for a given player.

    This model decouples contest scoring from the global Player.points so each
    contest can maintain its own independent scoring that starts at 0.
    """

    player_id: PydanticObjectId
    contest_id: PydanticObjectId
    points: float = 0.0

    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Tenant scope -- see app/utils/tenant.py. Optional only until the
    # backfill fills it in; None means "written before the migration".
    tournament_id: Optional[PydanticObjectId] = None

    class Settings:
        name = "player_contest_points"
        indexes = [
            "tournament_id",
            "player_id",
            "contest_id",
            [("contest_id", 1), ("player_id", 1)],  # for lookups in a contest
        ]
