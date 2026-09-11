import hashlib
from datetime import datetime, timedelta
from secrets import token_urlsafe
from typing import Optional, Tuple

from beanie import PydanticObjectId
from beanie.operators import In

from app.common.datetime_utils import utc_now
from app.models.password_reset import PasswordResetSession, PasswordResetToken
from app.models.user import RefreshToken, User
from app.services.auth.twofactor import send_otp_autogen
from app.services.auth.twofactor import verify_otp as provider_verify_otp
from app.utils.security import get_password_hash
from config.settings import get_settings

settings = get_settings()


def _now():
    return utc_now()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def start_session(phone: str) -> None:
    user: Optional[User] = None
    input_digits = "".join(ch for ch in phone if ch.isdigit())
    async for u in User.find(User.mobile != None):
        digits = "".join(ch for ch in (u.mobile or "") if ch.isdigit())
        if digits and digits == input_digits:
            user = u
            break
    if not user:
        return
    await PasswordResetSession.find(
        PasswordResetSession.user_id == user.id,
        In(PasswordResetSession.status, ["pending", "verified"]),
    ).delete()
    ok, provider_session_id, err = await send_otp_autogen(phone)
    if not ok:
        raise ValueError(err or "Failed to send OTP")
    expires = _now() + timedelta(seconds=settings.otp_expiry_seconds)
    session = PasswordResetSession(
        user_id=user.id,
        phone=phone,
        provider="2factor",
        provider_session_id=provider_session_id or "",
        status="pending",
        attempts=0,
        max_attempts=settings.otp_max_attempts,
        expires_at=expires,
        created_at=_now(),
        updated_at=_now(),
    )
    await session.insert()


async def verify_otp_and_issue_token(phone: str, otp: str) -> Tuple[str, int]:
    input_digits = "".join(ch for ch in phone if ch.isdigit())
    session = await PasswordResetSession.find_one(
        PasswordResetSession.phone == phone,
        PasswordResetSession.status == "pending",
    )
    if not session:
        session = await PasswordResetSession.find_one(
            PasswordResetSession.phone.regex(input_digits),
            PasswordResetSession.status == "pending",
        )
    if not session or session.expires_at < _now() or session.attempts >= session.max_attempts:
        raise ValueError("Invalid or expired session")
    session.attempts += 1
    session.updated_at = _now()
    await session.save()
    ok, err = await provider_verify_otp(session.provider_session_id, otp)
    if not ok:
        await session.save()
        raise ValueError(err or "OTP verification failed")
    session.status = "verified"
    await session.save()
    raw_token = token_urlsafe(48)
    token_hash = _hash_token(raw_token)
    ttl = settings.reset_token_ttl_seconds
    token_doc = PasswordResetToken(
        user_id=session.user_id,
        session_id=session.id,
        token_hash=token_hash,
        expires_at=_now() + timedelta(seconds=ttl),
        created_at=_now(),
    )
    await token_doc.insert()
    return raw_token, ttl


async def reset_password(reset_token: str, new_password: str) -> None:
    token_hash = _hash_token(reset_token)
    token_doc = await PasswordResetToken.find_one(PasswordResetToken.token_hash == token_hash)
    if not token_doc or token_doc.used_at is not None or token_doc.expires_at < _now():
        raise ValueError("Invalid or expired token")
    session = await PasswordResetSession.get(token_doc.session_id)
    if not session or session.status not in ("verified", "pending"):
        raise ValueError("Invalid session")
    user = await User.get(token_doc.user_id)
    if not user:
        raise ValueError("User not found")
    user.hashed_password = get_password_hash(new_password)
    user.updated_at = _now()
    await user.save()
    # Revoke all refresh tokens for this user
    async for rt in RefreshToken.find(RefreshToken.user_id == user.id, RefreshToken.revoked == False):
        rt.revoked = True
        await rt.save()
    token_doc.used_at = _now()
    await token_doc.save()
    session.status = "completed"
    await session.save()