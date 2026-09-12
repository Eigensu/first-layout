"""Turning what people typed into keys two accounts can be compared on.

Everything here exists to stop one bad key from merging strangers. The identity
graph joins accounts that share a mobile or an email, so a value that fifty
people share is not an identifier -- it is a bridge between fifty unrelated
accounts, and treating it as one would collapse them into a single login.
"""

import re
from typing import Optional

ASCII_DIGITS = "0123456789"

# Ten digits is the shortest thing that can be an Indian mobile. Anything
# shorter was a typo, a landline, or a placeholder, and none of those identify
# a person.
MIN_MOBILE_DIGITS = 10
MAX_MOBILE_DIGITS = 15

# A key appearing in more rows than this is treated as junk rather than as an
# identity, however plausible it looks. Two accounts sharing a number is a
# person with two accounts; eight sharing one is a call-centre number, a
# placeholder, or a shared family phone -- and it would chain all eight into
# one login. The cut is deliberately low: a false junk call splits accounts
# that should merge, which a human can fix, while a false identity call merges
# people who are not the same, which a human may never notice.
MAX_ROWS_PER_KEY = 3

# Addresses that are obviously not a person's, whatever the row says.
# Deliberately short. A denylist that guesses costs more than it saves: reject
# a real address and that person is split off from their own other account,
# silently, with nothing in the review queue to notice it by. The structural
# defence -- a key held by more rows than MAX_ROWS_PER_KEY is junk whatever it
# looks like -- catches shared placeholders without having to predict them, so
# only unambiguous ones are listed here. Single letters were listed once and
# removed: b@company.com is a plausible corporate alias.
_PLACEHOLDER_EMAIL_LOCALS = {
    "test",
    "tests",
    "testing",
    "example",
    "demo",
    "sample",
    "temp",
    "tmp",
    "noreply",
    "no-reply",
    "donotreply",
    "do-not-reply",
    "null",
    "none",
    "asdf",
    "qwerty",
    "abc",
    "xyz",
}
_PLACEHOLDER_EMAIL_DOMAINS = {
    "test.com",
    "example.com",
    "example.org",
    "example.net",
    "test.test",
    "a.com",
    "abc.com",
    "xyz.com",
    "mail.com",
    "email.com",
    "domain.com",
    "localhost",
    "none.com",
    "no.com",
}

_EMAIL_SHAPE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def digits_only(value: str) -> str:
    return "".join(ch for ch in value if ch in ASCII_DIGITS)


def normalise_mobile(raw: Optional[str]) -> Optional[str]:
    """A comparable mobile, or None when the value cannot identify anyone.

    Country codes are stripped down to the last ten digits so that
    ``919876543210`` and ``9876543210`` -- both of which exist in the live data,
    written by different code paths -- are recognised as the same phone rather
    than as two people.
    """
    if not raw:
        return None

    digits = digits_only(raw)
    if len(digits) < MIN_MOBILE_DIGITS or len(digits) > MAX_MOBILE_DIGITS:
        return None

    if len(digits) > MIN_MOBILE_DIGITS:
        digits = digits[-MIN_MOBILE_DIGITS:]

    # 0000000000, 1111111111 and friends are what people type to get past a
    # required field. They are not phones.
    if len(set(digits)) == 1:
        return None

    # An Indian mobile never starts below 6. This catches landlines and
    # truncated junk that happens to be ten characters long.
    if digits[0] in "012345":
        return None

    return digits


def normalise_email(raw: Optional[str]) -> Optional[str]:
    """A comparable email, or None when the value cannot identify anyone."""
    if not raw:
        return None

    value = raw.strip().lower()
    if not _EMAIL_SHAPE.match(value):
        return None

    local, _, domain = value.partition("@")

    if domain in _PLACEHOLDER_EMAIL_DOMAINS:
        return None
    if local in _PLACEHOLDER_EMAIL_LOCALS:
        return None

    # Gmail ignores dots and anything after a plus, so rahul.patel@gmail.com,
    # rahulpatel@gmail.com and rahul+lpcl@gmail.com are one inbox and one
    # person. Treating them as three would leave that person with three
    # accounts after a migration meant to give them one.
    if domain in {"gmail.com", "googlemail.com"}:
        local = local.split("+", 1)[0].replace(".", "")
        if not local:
            return None
        domain = "gmail.com"
    else:
        local = local.split("+", 1)[0]
        if not local:
            return None

    return f"{local}@{domain}"


def normalise_name(raw: Optional[str]) -> str:
    """Lowercased, punctuation-free, single-spaced -- for comparison only."""
    if not raw:
        return ""
    value = re.sub(r"[^a-z0-9\s]", " ", raw.strip().lower())
    return re.sub(r"\s+", " ", value).strip()
