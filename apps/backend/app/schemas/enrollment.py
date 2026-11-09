from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.common.datetime_utils import to_ist


class EnrollmentBulkRequest(BaseModel):
    team_ids: List[str] = Field(default_factory=list)


class UnenrollBulkRequest(BaseModel):
    team_ids: Optional[List[str]] = None
    enrollment_ids: Optional[List[str]] = None


class EnrollmentResponse(BaseModel):
    id: str
    team_id: str
    user_id: str
    contest_id: str
    status: str
    enrolled_at: datetime
    removed_at: Optional[datetime] = None

    # Stored and freshly made dates are both naive UTC, which a browser reads
    # as local time. With the IST offset on, they mean one instant everywhere.
    @field_validator("enrolled_at", "removed_at", mode="before")
    @classmethod
    def ensure_ist(cls, v):
        if isinstance(v, datetime):
            return to_ist(v)
        return v

    class Config:
        from_attributes = True
