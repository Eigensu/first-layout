from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

# ASCII only: str.isdigit() also accepts Unicode numerals (Arabic-Indic and
# friends), which would be stored verbatim and never compare equal to their
# ASCII form, slipping past both the collision check and the uniq_mobile index.
ASCII_DIGITS = "0123456789"


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
    auth_provider: str = "password"

    class Config:
        from_attributes = True


class UserUpdateRequest(BaseModel):
    """Partial profile update by the account owner.

    Only the fields present in the request body are touched, so the mobile
    app can collect a missing mobile number without resending the profile.
    """

    full_name: Optional[str] = None
    mobile: Optional[str] = None

    @field_validator("mobile")
    @classmethod
    def normalize_mobile(cls, v):
        if v is None:
            return v
        digits = "".join(ch for ch in v.strip() if ch in ASCII_DIGITS)
        if len(digits) < 10 or len(digits) > 15:
            raise ValueError("Mobile must be 10-15 digits")
        # Store digits-only, as registration and PUT /me already do. Login and
        # password reset compare digits so they tolerate symbols, but the
        # signup collision check (routes/auth.py) is an exact string match --
        # a number stored here as "+91 98765 43210" would slip past it and
        # create exactly the duplicate _mobile_taken_by_other exists to stop.
        return digits


class DeleteAccountRequest(BaseModel):
    """Schema for account deletion request"""

    password: Optional[str] = Field(
        None,
        description="Current password for verification; accounts with no password ignore this",
    )
    google_id_token: Optional[str] = Field(
        None,
        description=(
            "Fresh Google Identity Services ID token, required in place of "
            "password for passwordless (Google) accounts"
        ),
    )
    reason: Optional[str] = Field(
        None, max_length=500, description="Optional deletion reason"
    )
