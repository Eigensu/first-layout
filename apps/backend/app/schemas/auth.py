from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, model_validator, validator

ASCII_DIGITS = "0123456789"


class UserRegister(BaseModel):
    """Schema for user registration"""

    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None
    mobile: str

    @validator("username")
    def username_alphanumeric(cls, v):
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError(
                "Username must be alphanumeric (underscores and hyphens allowed)"
            )
        return v.lower()

    @validator("password")
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(char.islower() for char in v):
            raise ValueError("Password must contain at least one lowercase letter")
        return v

    @validator("mobile")
    def normalize_mobile(cls, v):
        v = v.strip()
        # ASCII only: str.isdigit() also accepts Unicode numerals (Arabic-Indic
        # and friends), which would be stored verbatim and never compare equal
        # to their ASCII form, slipping past both the collision check and the
        # uniq_mobile index.
        digits = "".join(ch for ch in v if ch in ASCII_DIGITS)
        if len(digits) != 10:
            raise ValueError("Mobile must be exactly 10 digits")
        return digits


class ResetDestination(BaseModel):
    """Where a reset code goes: a mobile number or an email address, not both.

    `phone` is the body every client has always sent, so it stays as it was;
    `email` is the second channel (spec §5.5).
    """

    phone: Optional[str] = None
    email: Optional[EmailStr] = None

    @validator("phone")
    def mobile_basic_validation(cls, v):
        if v is None:
            return v
        v = v.strip()
        digits = "".join(ch for ch in v if ch in ASCII_DIGITS)
        if len(digits) < 10 or len(digits) > 15:
            raise ValueError("Mobile must be 10-15 digits")
        return v

    @model_validator(mode="after")
    def exactly_one_destination(self):
        if (self.phone is None) == (self.email is None):
            raise ValueError("Send either a mobile number or an email address")
        return self

    @property
    def identifier(self) -> str:
        return self.phone if self.phone is not None else str(self.email)


class ForgotPasswordRequest(ResetDestination):
    pass


class ForgotPasswordVerify(ResetDestination):
    otp: str = Field(..., min_length=1, max_length=12)


class ForgotPasswordReset(BaseModel):
    reset_token: str
    new_password: str = Field(..., min_length=8)

    @validator("new_password")
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(char.islower() for char in v):
            raise ValueError("Password must contain at least one lowercase letter")
        return v


class UserLogin(BaseModel):
    """Schema for user login"""

    username: str
    password: str


class GoogleAuth(BaseModel):
    """Schema for Google Identity Services sign-in/sign-up"""

    id_token: str


class AppleAuth(BaseModel):
    """Schema for Sign in with Apple (native expo-apple-authentication on iOS)"""

    identity_token: str
    # Apple only returns the user's name on the very first authorization, and
    # never puts it in the identity token itself -- the client sends it
    # (already joined from fullName.givenName/familyName) so it can be
    # persisted on first sign-in. Absent on every subsequent sign-in.
    full_name: Optional[str] = None


class Token(BaseModel):
    """Schema for JWT token response"""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Schema for decoded token data"""

    username: Optional[str] = None
    exp: Optional[datetime] = None


class ChangePassword(BaseModel):
    """Schema for authenticated user password change"""

    current_password: str
    new_password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)

    @validator("confirm_password")
    def passwords_match(cls, v, values):
        if "new_password" in values and v != values["new_password"]:
            raise ValueError("Passwords do not match")
        return v

    @validator("new_password")
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(char.islower() for char in v):
            raise ValueError("Password must contain at least one lowercase letter")
        return v
