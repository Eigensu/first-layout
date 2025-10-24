from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field, EmailStr, ConfigDict
from datetime import datetime
from typing import Optional


class User(Document):
    """User document model for MongoDB using Beanie ODM"""

    username: Indexed(str, unique=True)  # type: ignore
    email: Indexed(EmailStr, unique=True)  # type: ignore
    hashed_password: str
    full_name: Optional[str] = None
    mobile: Optional[str] = None
    is_active: bool = True
    is_verified: bool = False
    is_admin: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None
    avatar_url: Optional[str] = None
    avatar_file_id: Optional[str] = None  # GridFS file id for avatar

    class Settings:
        name = "users"  # MongoDB collection name
        use_state_management = True
        indexes = [
            "username",
            "email",
            [("created_at", -1)],
        ]

    def __repr__(self):
        return f"<User {self.username}>"

    def __str__(self):
        return self.username


class RefreshToken(Document):
    """Refresh token document model for MongoDB"""

    user_id: PydanticObjectId
    token: Indexed(str, unique=True)  # type: ignore
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    revoked: bool = False

    class Settings:
        name = "refresh_tokens"
        indexes = [
            "token",
            "user_id",
            [("expires_at", 1)],  # TTL index for auto-deletion
        ]


class UserProfile(Document):
    """Optional: User profile document for additional user data"""

    user_id: Indexed(PydanticObjectId, unique=True)  # type: ignore
    bio: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    social_links: Optional[dict] = None
    preferences: Optional[dict] = None

    class Settings:
        name = "user_profiles"
        indexes = ["user_id"]
