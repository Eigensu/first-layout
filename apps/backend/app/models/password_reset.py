from datetime import datetime, timedelta
from typing import Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field


class PasswordResetSession(Document):
    user_id: PydanticObjectId
    phone: Indexed(str)  # type: ignore
    provider: str = "2factor"
    provider_session_id: str
    status: str = "pending"
    attempts: int = 0
    max_attempts: int = 5
    expires_at: datetime = Field(
        default_factory=lambda: datetime.utcnow() + timedelta(minutes=10)
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "password_reset_sessions"
        indexes = [
            "phone",
            [("expires_at", 1)],
        ]


class PasswordResetToken(Document):
    user_id: PydanticObjectId
    session_id: PydanticObjectId
    token_hash: Indexed(str, unique=True)  # type: ignore
    expires_at: datetime
    used_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "password_reset_tokens"
        indexes = [
            "token_hash",
            [("expires_at", 1)],
        ]
