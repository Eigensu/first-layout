from beanie import Document, Indexed
from pydantic import Field
from datetime import datetime
from typing import Optional


class Slot(Document):
    """Slot document model for MongoDB using Beanie ODM"""

    code: Indexed(str, unique=True)  # type: ignore - immutable machine identifier (A-Z0-9_-)
    name: Indexed(str, unique=True)  # type: ignore - human-friendly label
    min_select: int = 4
    max_select: int = 4
    description: Optional[str] = None
    requirements: Optional[dict] = None  # e.g., minimum stats required
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "slots"
        indexes = [
            "code",
            "name",
        ]

    def __repr__(self):
        return f"<Slot {self.name}>"

    def __str__(self):
        return self.name
