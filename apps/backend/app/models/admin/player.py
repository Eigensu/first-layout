from beanie import Document, Indexed
from pydantic import Field, field_validator
from datetime import datetime
from typing import Optional, Union


class Player(Document):
    """Player document model for MongoDB using Beanie ODM"""

    name: Indexed(str)  # type: ignore
    team: str
    role: str  # Batsman, Bowler, All-Rounder, Wicket-Keeper
    points: float = 0.0
    status: str = "Active"  # Active, Inactive, Injured
    price: float = 8.0  # Player price for fantasy selection
    slot: Optional[str] = None  # Slot assignment for the player (Slot ObjectId string)
    image_url: Optional[str] = None
    stats: Optional[dict] = None  # Batting avg, bowling avg, etc.
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator('slot', mode='before')
    @classmethod
    def convert_slot_to_string(cls, v):
        """Convert slot to string if it's an integer"""
        if v is None or isinstance(v, str):
            return v
        if isinstance(v, int):
            return str(v)
        raise ValueError(f"Invalid type for slot: {type(v).__name__}. Expected str or int.")

    class Settings:
        name = "players"
        indexes = [
            "name",
            "team",
            "role",
            "slot",
            [("points", -1)],
            [("price", 1)],
        ]

    def __repr__(self):
        return f"<Player {self.name}>"

    def __str__(self):
        return self.name
