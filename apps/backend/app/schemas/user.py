from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class UserResponse(BaseModel):
    """Schema for user response (excludes password)"""
    id: str
    username: str
    email: str
    full_name: Optional[str]
    mobile: Optional[str]
    is_active: bool
    is_verified: bool
    is_admin: bool
    created_at: datetime
    avatar_url: Optional[str]

    class Config:
        from_attributes = True


class DeleteAccountRequest(BaseModel):
    """Schema for account deletion request"""
    password: Optional[str] = Field(
        None, description="Current password for verification; omitted for passwordless (Google) accounts"
    )
    reason: Optional[str] = Field(None, max_length=500, description="Optional deletion reason")
