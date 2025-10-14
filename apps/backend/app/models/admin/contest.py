from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field
from datetime import datetime
from typing import Optional, List


class Contest(Document):
    """Contest document model for MongoDB using Beanie ODM"""

    name: Indexed(str)  # type: ignore
    type: str = "Public"  # Public, Private
    entry_fee: float = 0.0
    prize_pool: float = 0.0
    max_participants: int = 100
    participants: List[PydanticObjectId] = Field(default_factory=list)  # User IDs
    start_date: datetime
    end_date: Optional[datetime] = None
    status: str = "Upcoming"  # Upcoming, Active, Completed, Cancelled
    description: Optional[str] = None
    rules: Optional[dict] = None
    prize_distribution: Optional[dict] = None  # 1st place: 50%, 2nd: 30%, etc.
    created_by: Optional[PydanticObjectId] = None  # Admin user who created
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "contests"
        indexes = [
            "name",
            "type",
            "status",
            [("start_date", -1)],
        ]

    def __repr__(self):
        return f"<Contest {self.name}>"

    def __str__(self):
        return self.name

    @property
    def participant_count(self) -> int:
        return len(self.participants)

    @property
    def is_full(self) -> bool:
        return len(self.participants) >= self.max_participants
