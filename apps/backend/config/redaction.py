"""Redaction for values that end up in logs.

Kept apart from config.settings, which loads and validates every setting on
import, so a standalone script can use it without SECRET_KEY and the rest.
"""

import re
from urllib.parse import urlsplit, urlunsplit

_EMAIL = re.compile(
    r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}"
)
# Mobiles are stored as 10 to 15 bare digits (app/schemas/user.py), so any run
# of that many digits standing on its own is treated as one. Ids are hex or
# shorter (CricHeroes ids run to 8 digits), so they are left alone.
_MOBILE = re.compile(r"(?<!\w)\+?\d{10,15}(?!\w)")

EMAIL_PLACEHOLDER = "[email]"
MOBILE_PLACEHOLDER = "[mobile]"


def redact_personal_data(text: str) -> str:
    """`text` with every email address and mobile number replaced.

    For text that leaves for a third party (PostHog): a log line, an exception
    message, a URL. Users are known there by their id alone, and an error can
    quote whatever it failed on -- a duplicate-key error names the email that
    collided.
    """
    return _MOBILE.sub(MOBILE_PLACEHOLDER, _EMAIL.sub(EMAIL_PLACEHOLDER, text))


def redact_mongodb_url(url: str) -> str:
    """A MongoDB URL with its user, password and options removed.

    The full URL carries the database password, and whatever a service or a
    script prints is kept in its deploy logs or a terminal's scrollback.
    """
    parts = urlsplit(url)
    host = parts.netloc.rpartition("@")[2]
    return urlunsplit((parts.scheme, host, parts.path, "", ""))
