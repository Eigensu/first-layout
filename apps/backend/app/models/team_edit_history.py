from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime
from typing import Dict, Any


class TeamEditHistory(Document):
    """Audit log for team edits – records what changed and who did it."""

    team_id: PydanticObjectId
    user_id: PydanticObjectId  # who made the edit
    action: str  # "update" | "rename"
    changes: Dict[str, Any] = {}  # {"field": {"old": ..., "new": ...}}
    edited_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "team_edit_history"
        indexes = [
            [("team_id", 1), ("edited_at", -1)],
        ]
