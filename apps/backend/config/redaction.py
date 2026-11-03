"""Redaction for values that end up in logs.

Kept apart from config.settings, which loads and validates every setting on
import, so a standalone script can use it without SECRET_KEY and the rest.
"""

from urllib.parse import urlsplit, urlunsplit


def redact_mongodb_url(url: str) -> str:
    """A MongoDB URL with its user, password and options removed.

    The full URL carries the database password, and whatever a service or a
    script prints is kept in its deploy logs or a terminal's scrollback.
    """
    parts = urlsplit(url)
    host = parts.netloc.rpartition("@")[2]
    return urlunsplit((parts.scheme, host, parts.path, "", ""))
