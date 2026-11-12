"""Changing the email on a profile, confirmed by a code sent to it (spec §5.7).

The code goes to the new address and nothing changes until it comes back.
Otherwise one typo would silently cost someone their email reset channel --
the problem this exists to solve, since a mistyped signup address could never
be corrected before.

Shares its sessions with password reset (purpose "email_change").
"""

from typing import Optional

from beanie.operators import In
from pymongo.errors import DuplicateKeyError

from app.common.datetime_utils import utc_now
from app.models.password_reset import (
    CHANNEL_EMAIL,
    PURPOSE_EMAIL_CHANGE,
    PURPOSE_PASSWORD_RESET,
    PasswordResetSession,
)
from app.models.user import User
from app.services.auth.identity import (
    email_taken_by_other,
    normalize_email,
    set_profile_email,
)
from app.services.auth.password_reset import (
    check_email_code,
    claim_attempt,
    clear_open_sessions,
    mark_verified,
    send_email_code,
)


class EmailUnchanged(Exception):
    """The address asked for is already the account's email."""


class EmailTaken(Exception):
    """Another account already signs in with this address."""


async def request_email_change(user: User, new_email: str, brand: Optional[str]) -> str:
    """Mail a code to `new_email`. Returns the address as it will be stored.

    Raises EmailUnchanged or EmailTaken before anything is sent, and ValueError
    when the mail could not be sent.
    """
    address = normalize_email(new_email)
    if user.email and normalize_email(user.email) == address:
        raise EmailUnchanged()
    if await email_taken_by_other(address, user):
        raise EmailTaken()
    await clear_open_sessions(user.id, PURPOSE_EMAIL_CHANGE)
    await send_email_code(user.id, PURPOSE_EMAIL_CHANGE, address, brand)
    return address


async def confirm_email_change(user: User, otp: str) -> str:
    """Check the code and make its address the account's email.

    Raises ValueError for a wrong, expired or exhausted code, and EmailTaken
    if another account took the address while the code was in flight.
    Returns the new address.
    """
    session = await claim_attempt(
        PasswordResetSession.user_id == user.id,
        PasswordResetSession.purpose == PURPOSE_EMAIL_CHANGE,
    )
    check_email_code(session, otp)
    # Checked again: the request's check is minutes old by now.
    if await email_taken_by_other(session.destination, user):
        raise EmailTaken()
    await mark_verified(session)

    removed = set_profile_email(user, session.destination)
    # The first time this flag means anything on a password account: the
    # person has just shown they receive mail at this address.
    user.is_verified = True
    user.updated_at = utc_now()
    try:
        # Only the fields changed, not the whole document, so a sign-in or a
        # password change landing meanwhile is not overwritten.
        await user.set(
            {
                User.emails: user.emails,
                User.email: user.email,
                User.removed_emails: user.removed_emails,
                User.is_verified: True,
                User.updated_at: user.updated_at,
            }
        )
    except DuplicateKeyError:
        # The re-check above is read-then-write; uniq_emails settles the race.
        raise EmailTaken()
    await session.set({PasswordResetSession.status: "completed"})
    # A reset code mailed to the old address must not outlive it. Reset also
    # checks the address is still the account's; this just leaves nothing open.
    if removed:
        await PasswordResetSession.find(
            PasswordResetSession.user_id == user.id,
            PasswordResetSession.purpose == PURPOSE_PASSWORD_RESET,
            PasswordResetSession.channel == CHANNEL_EMAIL,
            In(PasswordResetSession.destination, removed),
        ).delete()
    return user.email
