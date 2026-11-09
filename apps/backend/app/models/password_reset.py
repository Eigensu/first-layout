from datetime import datetime, timedelta
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field

from app.common.datetime_utils import utc_now

PURPOSE_PASSWORD_RESET = "password_reset"
PURPOSE_EMAIL_CHANGE = "email_change"

CHANNEL_SMS = "sms"
CHANNEL_EMAIL = "email"


class PasswordResetSession(Document):
    """One code in flight: a password reset by SMS or email, or an email change.

    The two channels hold the code differently (spec §5.3). 2Factor generates
    and keeps an SMS code, so an SMS session holds only the provider's session
    id. Resend only delivers mail, so for email we generate the code and keep
    its keyed hash here.

    Ephemeral -- a session lives for OTP_EXPIRY_SECONDS -- so the change from
    `phone` to `destination` needed no data migration: sessions written before
    it no longer match any lookup, and their owners request a fresh code.
    """

    user_id: PydanticObjectId
    purpose: str = PURPOSE_PASSWORD_RESET
    channel: str = CHANNEL_SMS
    # Compared exactly, never by pattern: a mobile's canonical digits
    # (identity.canonical_mobile) or a lowercased email address.
    destination: str
    provider: str = "2factor"  # "2factor" | "resend"
    provider_session_id: Optional[str] = None  # SMS: 2Factor holds the code
    otp_hash: Optional[str] = None  # email: we hold the code, as a keyed hash
    status: str = "pending"  # pending | verified | completed
    attempts: int = 0
    max_attempts: int = 5
    expires_at: datetime = Field(
        default_factory=lambda: utc_now() + timedelta(minutes=10)
    )
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "password_reset_sessions"
        indexes = [
            [("destination", 1), ("purpose", 1), ("status", 1)],
            [("user_id", 1), ("purpose", 1), ("status", 1)],
            [("expires_at", 1)],
        ]


class PasswordResetToken(Document):
    user_id: PydanticObjectId
    session_id: PydanticObjectId
    # The hash of 48 random bytes, so unique in practice; not in the database,
    # where the field-level unique was shadowed by Settings.indexes (spec §13.8, R22).
    token_hash: str
    expires_at: datetime
    used_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "password_reset_tokens"
        indexes = [
            "token_hash",
            [("expires_at", 1)],
        ]
