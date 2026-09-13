"""Resolving who is signing in, and whether their password is one of theirs.

Neither of these is wired into a route yet. They cannot be until the backfill
populates `emails`/`mobiles` -- resolving against empty arrays would fail every
login. See docs/UNIFIED_AUTH_SPEC.md §4.2 and §4.3.
"""

from typing import List, Optional, Tuple

from app.models.user import User
from app.utils.security import get_password_hash, verify_password

# ASCII only: str.isdigit() also accepts Unicode numerals, which would be stored
# verbatim and never compare equal to their ASCII form -- slipping past both the
# collision checks and the unique indexes.
ASCII_DIGITS = "0123456789"


class AmbiguousIdentifier(Exception):
    """More than one account answers to this username.

    Raised rather than resolved, because guessing is the one thing that must
    not happen here: usernames stop being unique when five databases become
    one, so picking the first match would sign someone into a stranger's
    account. The route turns this into a 409 telling them to use their mobile
    or email instead.
    """

    def __init__(self, identifier: str):
        self.identifier = identifier
        super().__init__(f"{identifier!r} matches more than one account")


def digits_only(value: str) -> str:
    return "".join(ch for ch in value if ch in ASCII_DIGITS)


def canonical_mobile(digits: str) -> str:
    """The comparable form of a number, whichever way it was stored.

    Reduces to the last ten digits, so "+91 98765 43210", "919876543210" and
    "9876543210" -- all three of which the live data holds, written by
    different code paths over the years -- compare equal.
    """
    return digits[-10:] if len(digits) > 10 else digits


def mobile_candidates(digits: str) -> List[str]:
    """The forms a typed number might be stored as, most exact first.

    Numbers are stored digits-only, but nothing has ever forced them to be
    stored the *same* way: registration writes the ten digits a user typed,
    while PATCH /api/users/me accepts ten to fifteen, so an account created
    through one path may hold 9876543210 and another 919876543210 for the same
    phone. Someone typing "+91 98765 43210" should reach either.

    The exact match is always tried first, so the suffix fallback only decides
    cases the exact form could not, and the unique index means it can match at
    most one account.
    """
    if not digits:
        return []
    candidates = [digits]
    if len(digits) > 10:
        suffix = digits[-10:]
        if suffix != digits:
            candidates.append(suffix)
    return candidates


async def _by_mobile(digits: str) -> Optional[User]:
    """Mobile lookup, newest storage shape first.

    The identity arrays are empty on every account until the backfill runs, so
    a lookup that only consulted them would fail every existing user -- which
    is the whole login route, on live tournaments. The scalar `mobile` is
    therefore tried next, and it is indexed (uniq_mobile), so the common case
    is now a single index hit rather than the collection walk this replaces.

    The scan at the end is the last resort, and it is much narrower than the
    one it replaces: registration and PATCH /me both store digits-only, so only
    rows written before that normalisation can hold a number with symbols in
    it, and only those are read.
    """
    for candidate in mobile_candidates(digits):
        user = await User.find_one(User.mobiles == candidate)
        if user:
            return user

    for candidate in mobile_candidates(digits):
        user = await User.find_one(User.mobile == candidate)
        if user:
            return user

    wanted = canonical_mobile(digits)
    async for user in User.find({"mobile": {"$not": {"$regex": "^[0-9]+$"}}}):
        stored = digits_only(user.mobile or "")
        # Compared canonically on both sides: the stored value is the one with
        # the country code as often as the typed one is.
        if stored and canonical_mobile(stored) == wanted:
            return user

    return None


async def _by_email(value: str) -> Optional[User]:
    """Email lookup, array first and the scalar behind it for the same reason."""
    user = await User.find_one(User.emails == value)
    if user:
        return user
    return await User.find_one(User.email == value)


async def resolve_login_identity(identifier: str) -> Optional[User]:
    """Find the account signing in, by mobile, email, or (for now) username.

    Works before and after the backfill: the identity arrays are consulted
    first and the scalar fields behind them, so this can ship to a live
    tournament whose accounts have neither array populated yet.
    """
    value = identifier.strip().lower()
    if not value:
        return None

    digits = digits_only(value)
    if digits:
        user = await _by_mobile(digits)
        if user:
            return user

    if "@" in value:
        user = await _by_email(value)
        if user:
            return user

    # Transitional: someone typing the username they have always used. Once
    # usernames are no longer unique this can only be honoured when it is
    # unambiguous, and the ambiguous case has to be refused rather than guessed.
    matches = await User.find(User.username == value).limit(2).to_list()
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise AmbiguousIdentifier(value)

    return None


def verify_user_password(user: User, plaintext: str) -> Tuple[bool, bool]:
    """Check a password against the primary hash and any carried-over ones.

    Returns (ok, used_legacy). A merged account has more than one valid
    password -- one per account it was merged from -- and the person remembers
    whichever they last used.
    """
    if user.hashed_password and verify_password(plaintext, user.hashed_password):
        return True, False

    for legacy in user.legacy_hashes:
        if verify_password(plaintext, legacy.hashed_password):
            return True, True

    return False, False


async def promote_legacy_password(user: User, plaintext: str) -> None:
    """Make the password they just used the only one that works.

    Called after a successful login via a legacy hash. Rehashes rather than
    copying the matched hash across, so the account also picks up the current
    hashing parameters. The extra valid secrets therefore exist only until each
    person next signs in, instead of for as long as the account does.
    """
    user.hashed_password = get_password_hash(plaintext)
    user.legacy_hashes = []
    await user.save()


def primary_identity(values: List[str]) -> Optional[str]:
    """The scalar `email`/`mobile`/`google_id` kept in step with its array."""
    return values[0] if values else None
