from datetime import datetime
from typing import List, Optional

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

from app.common.datetime_utils import utc_now


class PlayerSelection(BaseModel):
    """Player selection within a team"""
    player_id: str
    is_captain: bool = False
    is_vice_captain: bool = False


class Team(Document):
    """Team model for fantasy cricket teams"""
    
    user_id: PydanticObjectId  # Reference to User._id
    team_name: str
    player_ids: List[str] = []  # List of selected player IDs
    captain_id: Optional[str] = None
    vice_captain_id: Optional[str] = None
    total_points: float = 0.0
    total_value: float = 0.0  # Total price of all players
    rank: Optional[int] = None
    rank_change: Optional[int] = None  # positive = moved up, negative = moved down
    contest_id: Optional[str] = None  # Optional: reference to a contest
    
    # Metadata
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    
    class Settings:
        name = "teams"
        indexes = [
            "user_id",
            [("total_points", -1)],  # Descending order for leaderboard
            [("created_at", -1)],
            [("player_ids", 1)],  # Multikey index to speed up selection lookups
        ]
