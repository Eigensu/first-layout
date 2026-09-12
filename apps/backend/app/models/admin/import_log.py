from datetime import datetime
from typing import Any, Dict, List, Optional

from beanie import Document
from pydantic import Field


class ImportLog(Document):
    """Import log document for tracking bulk player imports"""

    user_id: str  # User who performed the import
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    dry_run: bool = False

    # File info
    filename: str
    file_size: int  # bytes
    checksum: str  # SHA256 of file content
    format: str  # xlsx or csv

    # Import settings
    conflict_policy: str  # skip, update, error
    slot_strategy: str  # lookup, create, ignore

    # Results
    total_rows: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    invalid_rows: int = 0

    # Error details (limited to first N errors)
    sample_errors: Optional[List[Dict[str, Any]]] = None
    conflicts: Optional[List[Dict[str, Any]]] = None

    # Idempotency
    idempotency_key: Optional[str] = None

    class Settings:
        name = "import_logs"
        indexes = [
            "user_id",
            "checksum",
            "idempotency_key",
            [("started_at", -1)],
        ]

    def __repr__(self):
        return f"<ImportLog {self.filename} by {self.user_id}>"
