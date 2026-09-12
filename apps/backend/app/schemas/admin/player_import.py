from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ImportOptions(BaseModel):
    """Options for player import"""

    dry_run: bool = True
    conflict: str = Field(default="skip", pattern="^(skip|update|error)$")
    slot_strategy: str = Field(default="lookup", pattern="^(lookup|create|ignore)$")
    header_row: int = Field(default=1, ge=1)


class RowError(BaseModel):
    """Individual row error"""

    row: int
    field: Optional[str] = None
    message: str


class ConflictDetail(BaseModel):
    """Conflict detail"""

    row: int
    reason: str


class PlayerSample(BaseModel):
    """Sample player data for preview"""

    name: str
    team: str
    points: float
    status: str = "Active"
    slot: Optional[str] = None


class ImportResponse(BaseModel):
    """Response from import endpoint"""

    dry_run: bool
    format: str
    total_rows: int
    valid_rows: int
    invalid_rows: int
    created: int = 0
    updated: int = 0
    skipped: int = 0
    conflicts: List[ConflictDetail] = []
    errors: List[RowError] = []
    samples: List[PlayerSample] = []
    has_more_errors: bool = False
    job_id: Optional[str] = None
    idempotency_key: Optional[str] = None


class ImportLogResponse(BaseModel):
    """Import log response"""

    id: str
    user_id: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    dry_run: bool
    filename: str
    format: str
    total_rows: int
    created: int
    updated: int
    skipped: int
    invalid_rows: int
    conflict_policy: str
    slot_strategy: str

    class Config:
        from_attributes = True


class ImportLogListResponse(BaseModel):
    """Import log list response"""

    logs: List[ImportLogResponse]
    total: int
    page: int
    page_size: int
