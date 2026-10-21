"""Password reset by SMS or email, and the code sessions both share (spec §5).

A session is opened on request, verified by the code, and spent by one reset.
SMS codes are generated and checked by 2Factor; email codes by us
(email_otp.py). Everything after the code check is the same for both.
"""

import hashlib
from datetime import datetime, timedelta
from secrets import token_urlsafe
from typing import Optional, Tuple

from beanie import PydanticObjectId
from beanie.operators import In
from pymongo import ReturnDocument

from app.models.password_reset import (
    CHANNEL_EMAIL,
    CHANNEL_SMS,
    PURPOSE_PASSWORD_RESET,
    PasswordResetSession,
    PasswordResetToken,
)
from app.models.user import RefreshToken, User
from app.services.auth.email_otp import (
    generate_otp,
    hash_otp,
    otp_matches,
    send_otp_email,
)
from app.services.auth.identity import (
    digits_only,
    normalize_email,
    resolve_email_holder,
    resolve_phone_holder,
    set_new_password,
)
from app.services.auth.twofactor import send_otp_autogen
from app.services.auth.twofactor import verify_otp as provider_verify_otp
from config.settings import get_settings

settings = get_settings()


def _now():
    return datetime.utcnow()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def sms_destination(phone: str) -> str:
    """Digits only, so the session is found by equality, never by pattern.

    The pattern fallback this replaces matched any session whose number merely
    contained the digits typed (spec §5.5).
    """
    return digits_only(phone)


# --------------------------------------------------------------------------
# sessions, either channel
# --------------------------------------------------------------------------


async def clear_open_sessions(user_id: PydanticObjectId, purpose: str) -> None:
    """A new code replaces any still open for the same purpose."""
    await PasswordResetSession.find(
        PasswordResetSession.user_id == user_id,
        PasswordResetSession.purpose == purpose,
        In(PasswordResetSession.status, ["pending", "verified"]),
    ).delete()


def _new_session(
    user_id: PydanticObjectId, purpose: str, channel: str, destination: str, **fields
) -> PasswordResetSession:
    now = _now()
    return PasswordResetSession(
        id=PydanticObjectId(),
        user_id=user_id,
        purpose=purpose,
        channel=channel,
        destination=destination,
        status="pending",
        attempts=0,
        max_attempts=settings.otp_max_attempts,
        expires_at=now + timedelta(seconds=settings.otp_expiry_seconds),
        created_at=now,
        updated_at=now,
        **fields,
    )


async def send_email_code(
    user_id: PydanticObjectId, purpose: str, address: str, brand: Optional[str]
) -> None:
    """Open an email session and mail its code.

    The session is written first, because the code's hash is keyed on its id;
    if the mail then fails it is removed, so no session waits on a code that
    was never sent.
    """
    code = generate_otp()
    session = _new_session(user_id, purpose, CHANNEL_EMAIL, address, provider="resend")
    session.otp_hash = hash_otp(code, session.id)
    await session.insert()
    ok, err = await send_otp_email(
        address, code, purpose, f"{purpose}:{session.id}", brand=brand
    )
    if not ok:
        await session.delete()
        raise ValueError(err or "Failed to send the code")


async def claim_attempt(*conditions) -> PasswordResetSession:
    """The newest open session matching `conditions`, with one attempt counted.

    The count is a conditional increment, not a read then a save. On email we
    check the code ourselves, so the attempt cap is all that stands between a
    six-digit code and guessing it -- and a read-then-save lets any number of
    parallel guesses through on the same count.
    """
    session = (
        await PasswordResetSession.find(
            *conditions, PasswordResetSession.status == "pending"
        )
        .sort(-PasswordResetSession.created_at)
        .first_or_none()
    )
    if not session or session.expires_at < _now():
        raise ValueError("Invalid or expired session")
    counted = await PasswordResetSession.get_motor_collection().find_one_and_update(
        {
            "_id": session.id,
            "status": "pending",
            "attempts": {"$lt": session.max_attempts},
        },
        {"$inc": {"attempts": 1}, "$set": {"updated_at": _now()}},
        return_document=ReturnDocument.AFTER,
    )
    if counted is None:
        raise ValueError("Invalid or expired session")
    session.attempts = counted["attempts"]
    return session


async def mark_verified(session: PasswordResetSession) -> None:
    """pending -> verified, once: a code spends its session."""
    moved = await PasswordResetSession.get_motor_collection().find_one_and_update(
        {"_id": session.id, "status": "pending"},
        {"$set": {"status": "verified", "updated_at": _now()}},
    )
    if moved is None:
        raise ValueError("Invalid or expired session")
    session.status = "verified"


def check_email_code(session: PasswordResetSession, otp: str) -> None:
    if not otp_matches(otp, session.id, session.otp_hash):
        raise ValueError("OTP verification failed")


# --------------------------------------------------------------------------
# password reset: SMS
# --------------------------------------------------------------------------


async def start_session(phone: str) -> None:
    # By number only. The code goes to the number typed, so the account reset
    # must be the one holding it; login's resolver would fall back to an
    # all-digit username and hand someone else's account to this phone.
    user: Optional[User] = await resolve_phone_holder(phone)
    if not user:
        return
    await clear_open_sessions(user.id, PURPOSE_PASSWORD_RESET)
    ok, provider_session_id, err = await send_otp_autogen(phone)
    if not ok:
        raise ValueError(err or "Failed to send OTP")
    session = _new_session(
        user.id,
        PURPOSE_PASSWORD_RESET,
        CHANNEL_SMS,
        sms_destination(phone),
        provider="2factor",
        provider_session_id=provider_session_id or "",
    )
    await session.insert()


async def verify_otp_and_issue_token(phone: str, otp: str) -> Tuple[str, int]:
    session = await claim_attempt(
        PasswordResetSession.purpose == PURPOSE_PASSWORD_RESET,
        PasswordResetSession.channel == CHANNEL_SMS,
        PasswordResetSession.destination == sms_destination(phone),
    )
    ok, err = await provider_verify_otp(session.provider_session_id or "", otp)
    if not ok:
        raise ValueError(err or "OTP verification failed")
    return await _issue_token(session)


# --------------------------------------------------------------------------
# password reset: email
# --------------------------------------------------------------------------


async def start_email_session(email: str, brand: Optional[str] = None) -> None:
    # By address only, for the reason start_session goes by number only.
    user: Optional[User] = await resolve_email_holder(email)
    if not user:
        return
    await clear_open_sessions(user.id, PURPOSE_PASSWORD_RESET)
    await send_email_code(
        user.id, PURPOSE_PASSWORD_RESET, normalize_email(email), brand
    )


async def verify_email_otp_and_issue_token(email: str, otp: str) -> Tuple[str, int]:
    session = await claim_attempt(
        PasswordResetSession.purpose == PURPOSE_PASSWORD_RESET,
        PasswordResetSession.channel == CHANNEL_EMAIL,
        PasswordResetSession.destination == normalize_email(email),
    )
    check_email_code(session, otp)
    return await _issue_token(session)


# --------------------------------------------------------------------------
# the reset itself
# --------------------------------------------------------------------------


async def _issue_token(session: PasswordResetSession) -> Tuple[str, int]:
    await mark_verified(session)
    raw_token = token_urlsafe(48)
    ttl = settings.reset_token_ttl_seconds
    token_doc = PasswordResetToken(
        user_id=session.user_id,
        session_id=session.id,
        token_hash=_hash_token(raw_token),
        expires_at=_now() + timedelta(seconds=ttl),
        created_at=_now(),
    )
    await token_doc.insert()
    return raw_token, ttl


async def reset_password(reset_token: str, new_password: str) -> None:
    token_doc = await PasswordResetToken.find_one(
        PasswordResetToken.token_hash == _hash_token(reset_token)
    )
    if not token_doc or token_doc.used_at is not None or token_doc.expires_at < _now():
        raise ValueError("Invalid or expired token")
    session = await PasswordResetSession.get(token_doc.session_id)
    # Only a verified session: the guard this replaces also let a pending one
    # through, which is a session nobody has entered a code for (spec §5.5).
    if (
        not session
        or session.status != "verified"
        or session.purpose != PURPOSE_PASSWORD_RESET
    ):
        raise ValueError("Invalid session")
    user = await User.get(token_doc.user_id)
    if not user:
        raise ValueError("User not found")
    # Spent before the password changes, and conditionally, so two requests
    # racing with one token cannot both reset.
    spent = await PasswordResetToken.get_motor_collection().find_one_and_update(
        {"_id": token_doc.id, "used_at": None}, {"$set": {"used_at": _now()}}
    )
    if spent is None:
        raise ValueError("Invalid or expired token")
    set_new_password(user, new_password)
    user.updated_at = _now()
    await user.save()
    # Revoke all refresh tokens for this user
    async for rt in RefreshToken.find(
        RefreshToken.user_id == user.id, RefreshToken.revoked == False
    ):
        rt.revoked = True
        await rt.save()
    session.status = "completed"
    session.updated_at = _now()
    await session.save()
