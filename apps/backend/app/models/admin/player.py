from datetime import datetime
from typing import Optional, Union

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field, field_validator

from app.common.datetime_utils import utc_now


class Player(Document):
    """Player document model for MongoDB using Beanie ODM"""

    name: Indexed(str)  # type: ignore
    team: str
    points: float = 0.0
    status: str = "Active"  # Active, Inactive, Injured
    # Auction sale value. 0 means the player has never been auctioned, which
    # makes them ineligible for auction-purse contests (see services/auction.py).
    price: float = 0.0
    slot: Optional[str] = None  # Slot assignment for the player (Slot ObjectId string)
    image_url: Optional[str] = None
    # The player's id on CricHeroes, set by the player import. It is what ties
    # CricHeroes stats to this player (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md
    # §13.2); unique within a tournament, which the importer enforces.
    cricheroes_player_id: Optional[int] = None
    stats: Optional[dict] = None  # Batting avg, bowling avg, etc.
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @field_validator("slot", mode="before")
    @classmethod
    def convert_slot_to_string(cls, v):
        """Convert slot to string if it's an integer"""
        if v is None or isinstance(v, str):
            return v
        if isinstance(v, int):
            return str(v)
        raise ValueError(
            f"Invalid type for slot: {type(v).__name__}. Expected str or int."
        )

    # Tenant scope -- see app/utils/tenant.py. Optional only until the
    # backfill fills it in; None means "written before the migration".
    tournament_id: Optional[PydanticObjectId] = None

    class Settings:
        name = "players"
        indexes = [
            "tournament_id",
            "name",
            "team",
            "slot",
            [("points", -1)],
            [("price", 1)],
        ]

    def __repr__(self):
        return f"<Player {self.name}>"

    def __str__(self):
        return self.name
