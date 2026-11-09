from datetime import datetime
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field

from app.common.datetime_utils import utc_now


class Slot(Document):
    """Slot document model for MongoDB using Beanie ODM"""

    # Unique by the admin routes' checks, not by the database: the field-level
    # uniques were shadowed by the "code" and "name" entries in
    # Settings.indexes and never built (spec §13.8, R22).
    code: str  # immutable machine identifier (A-Z0-9_-)
    name: str  # human-friendly label
    min_select: int = 4
    max_select: int = 4
    description: Optional[str] = None
    requirements: Optional[dict] = None  # e.g., minimum stats required
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    # Tenant scope -- see app/utils/tenant.py. Optional only until the
    # backfill fills it in; None means "written before the migration".
    tournament_id: Optional[PydanticObjectId] = None

    class Settings:
        name = "slots"
        indexes = [
            "tournament_id",
            "code",
            "name",
        ]

    def __repr__(self):
        return f"<Slot {self.name}>"

    def __str__(self):
        return self.name
