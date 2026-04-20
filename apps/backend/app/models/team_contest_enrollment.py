from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime
from typing import Optional
from pymongo import IndexModel
from app.common.enums.enrollments import EnrollmentStatus


class TeamContestEnrollment(Document):
    """Join document mapping a Team to a Contest with enrollment metadata."""

    team_id: PydanticObjectId
    user_id: PydanticObjectId  # denormalized for faster queries
    contest_id: PydanticObjectId

    status: EnrollmentStatus = EnrollmentStatus.ACTIVE
    enrolled_at: datetime = Field(default_factory=datetime.utcnow)
    removed_at: Optional[datetime] = None

    class Settings:
        name = "team_contest_enrollments"
        indexes = [
            "team_id",
            "contest_id",
            "user_id",
            [("contest_id", 1), ("status", 1)],
            [("team_id", 1), ("contest_id", 1), ("status", 1)],
            IndexModel(
                [("contest_id", 1), ("user_id", 1)],
                unique=True,
                partialFilterExpression={"status": EnrollmentStatus.ACTIVE.value},
                name="uniq_active_user_per_contest",
            ),
        ]
