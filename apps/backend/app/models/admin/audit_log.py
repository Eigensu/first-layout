from beanie import Document
from pydantic import Field
from datetime import datetime
from typing import Optional, Dict, Any


class AdminActionLog(Document):
    """Lightweight audit trail for admin actions that have no record of their
    own once they complete — e.g. a deleted player leaves no trace of who
    deleted it or why.
    """

    admin_id: str
    action: str  # e.g. "player.delete"
    target_type: str  # e.g. "player"
    target_id: str
    details: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "admin_action_logs"
        indexes = [
            "admin_id",
            "target_id",
            [("created_at", -1)],
        ]

    def __repr__(self):
        return f"<AdminActionLog {self.action} {self.target_type}:{self.target_id} by {self.admin_id}>"
