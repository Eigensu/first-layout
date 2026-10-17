"""Resolving who is signing in, and whether their password is one of theirs.

Used by the login, password-reset and profile routes. Every lookup falls back
from the identity arrays to the scalar fields, so this works on accounts the
backfill has not reached yet. See docs/UNIFIED_AUTH_SPEC.md §4.2 and §4.3.
"""

from typing import List, Optional, Tuple

from app.models.user import User
from app.utils.security import get_password_hash, verify_password

# ASCII only: str.isdigit() also accepts Unicode numerals, which would be stored
# verbatim and never compare equal to their ASCII form -- slipping past both the
# collision checks and the unique indexes.
ASCII_DIGITS = "0123456789"

INDIA_COUNTRY_CODE = "91"


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


def is_phone_shaped(value: str) -> bool:
    """True when the identifier reads as a typed number: digits, no letters.

    Letters are what rule a number out -- "rahul123" must not be reduced to
    "123" and looked up as somebody's mobile. Punctuation is not: the signup
    and profile validators keep the digits of whatever was typed, so a number
    entered as "98765/43210" was stored as 9876543210, and refusing the same
    input at sign-in would lock its owner out.
    """
    return any(ch in ASCII_DIGITS for ch in value) and not any(
        ch.isalpha() for ch in value
    )


def mobile_candidates(digits: str) -> List[str]:
    """The forms a typed number might be stored as, most exact first.

    Numbers are stored digits-only, but nothing has ever forced them to be
    stored the *same* way: registration writes the ten digits a user typed,
    while PATCH /api/users/me accepts ten to fifteen, so an account created
    through one path may hold 9876543210 and another 919876543210 for the same
    phone. Someone typing "+91 98765 43210" should reach either.

    The fallback therefore has to work in both directions. Stripping a country
    code handles a long input against a short stored value; adding one handles
    a short input against a long stored value, which is the case a user hits
    every time they update their number through the profile and then sign in
    with the ten digits they have always typed.

    The exact match is always tried first, so a fallback only decides cases the
    exact form could not, and the unique index means each candidate can match
    at most one account.
    """
    if not digits:
        return []
    candidates = [digits]
    if len(digits) > 10:
        suffix = digits[-10:]
        if suffix not in candidates:
            candidates.append(suffix)
    elif len(digits) == 10:
        # The only country code this product has ever issued numbers for. A
        # general phone library would be overkill for one prefix, but leaving
        # this direction out strands anyone whose stored number carries it.
        prefixed = f"{INDIA_COUNTRY_CODE}{digits}"
        if prefixed not in candidates:
            candidates.append(prefixed)
    return candidates


def canonical_mobile(digits: str) -> str:
    """The comparable form of a number, whichever way it was stored.

    Reduces to the last ten digits, so "+91 98765 43210", "919876543210" and
    "9876543210" -- all three of which the live data holds, written by
    different code paths over the years -- compare equal.
    """
    return digits[-10:] if len(digits) > 10 else digits


async def _holder_of(forms: List[str]) -> Optional[User]:
    """The account holding any of these numbers, newest storage shape first.

    The identity arrays are empty on every account until the backfill runs, so
    a lookup that only consulted them would fail every existing user -- which
    is the whole login route, on live tournaments. The scalar `mobile` is
    therefore tried next, and it is indexed (uniq_mobile), so each form is a
    single index hit rather than the collection walk this replaces.
    """
    for form in forms:
        user = await User.find_one(User.mobiles == form)
        if user:
            return user
    for form in forms:
        user = await User.find_one(User.mobile == form)
        if user:
            return user
    return None


async def _holder_of_symbol_number(digits: str) -> Optional[User]:
    """Last resort: a number stored before mobiles were normalised.

    Registration and PATCH /me both store digits-only, so only rows written
    before that normalisation can hold "+91 98765 43210", and only those are
    read. `$type: "string"` is what keeps it that narrow: `$not` on its own also
    matches a null or missing field, which is every account with no mobile.
    """
    wanted = canonical_mobile(digits)
    async for user in User.find(
        {"mobile": {"$type": "string", "$not": {"$regex": "^[0-9]+$"}}}
    ):
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

    Order matters, and the ordering rule is: exact matches on a real login key
    first, then an exact username, then the number forms that are only inferred.

    Works before and after the backfill: the identity arrays are consulted
    first and the scalar fields behind them, so this can ship to a live
    tournament whose accounts have neither array populated yet.
    """
    value = identifier.strip().lower()
    if not value:
        return None

    digits = ""
    derived: List[str] = []

    # An identifier holding "@" is an address, never a phone number, and it has
    # to be treated as one *before* anything reduces it to its digits.
    # "9876543210@example.com" is a perfectly ordinary address here -- a phone
    # number as the local part is common -- and digit-reducing it first would
    # resolve it to whichever unrelated account owns that mobile, then check
    # this person's password against that stranger's hash.
    if "@" in value:
        user = await _by_email(value)
        if user:
            return user
    elif is_phone_shaped(value):
        # Phone-shaped only: a username like "rahul123" must not be reduced to
        # "123" and looked up as somebody's number.
        digits = digits_only(value)
        candidates = mobile_candidates(digits)
        if candidates:
            exact, derived = candidates[0], candidates[1:]
            user = await _holder_of([exact])
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

    # Last: the number forms nobody typed. Registration accepts an all-digit
    # username, so "9876543210" may be one person's name and, with a country
    # code bolted on, another person's number. An inferred form must never
    # outrank the exact username someone actually holds.
    if digits:
        user = await _holder_of(derived)
        if user:
            return user
        return await _holder_of_symbol_number(digits)

    return None


async def resolve_phone_holder(phone: str) -> Optional[User]:
    """The account holding this number -- by number alone, never by username.

    For flows where the number itself is the credential: password reset texts
    its code to the number typed, so the account it resets has to be the one
    holding that number. resolve_login_identity cannot be used there. It falls
    back to usernames, and an all-digit username would bind one person's reset
    to whoever owns the phone their name happens to spell.

    Same order as login: the exact form, then the inferred ones.
    """
    value = phone.strip()
    if not is_phone_shaped(value):
        return None
    digits = digits_only(value)
    candidates = mobile_candidates(digits)
    if not candidates:
        return None
    exact, derived = candidates[0], candidates[1:]
    user = await _holder_of([exact])
    if user:
        return user
    user = await _holder_of(derived)
    if user:
        return user
    return await _holder_of_symbol_number(digits)


def set_profile_mobile(user: User, number: str) -> None:
    """Replace the number on a profile, in both fields login reads it from.

    The old number has to leave `mobiles` as well as `mobile`. Login and
    password reset both consult `mobiles` first, so a number left behind there
    keeps unlocking the account after its owner has given it up -- and once it
    is reissued or claimed by someone else, that someone receives this
    account's reset code. Other numbers a merged account carries from its
    other tournaments are not the one being replaced, and stay.
    """
    replaced = user.mobile
    user.mobiles = [number] + [m for m in user.mobiles if m not in (number, replaced)]
    user.mobile = number


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


def set_new_password(user: User, plaintext: str) -> None:
    """Make `plaintext` the account's only valid password.

    Clears the carried-over hashes too. Login accepts those, so a change or a
    reset that replaced only the primary hash would leave every old password
    working -- and the next login with one would promote it over the new one.
    """
    user.hashed_password = get_password_hash(plaintext)
    user.legacy_hashes = []


def primary_identity(values: List[str]) -> Optional[str]:
    """The scalar `email`/`mobile`/`google_id` kept in step with its array."""
    return values[0] if values else None
