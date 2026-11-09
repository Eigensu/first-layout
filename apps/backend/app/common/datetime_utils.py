"""Datetime utilities for consistent handling across the application.

The convention is: **store and compare in naive UTC, display in IST.**

Naive rather than aware because that is what the driver hands back. The Mongo
client is not opened with tz_aware=True, so every datetime read from the
database is a naive UTC value. Producing aware datetimes for writes would mean
fresh values and stored values have different types, and comparing the two
raises TypeError -- the exact bug this module exists to prevent.

Use utc_now() for anything written to or compared against the database, and
to_ist() only at the point where a value is rendered for a user.
"""

from datetime import datetime, timedelta, timezone

# IST is UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))


def utc_now() -> datetime:
    """Return the current time as a naive UTC datetime.

    This is the one way to produce "now" for storage or comparison. Note that
    datetime.utcnow() is deprecated from Python 3.12, which this replaces.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_utc_naive(dt: datetime) -> datetime:
    """Normalize any datetime to naive UTC, for storage or comparison.

    Aware values are converted to UTC and stripped; naive values are assumed to
    already be UTC and returned unchanged. Use this on a datetime of uncertain
    origin before comparing it with utc_now().
    """
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def to_ist(dt: datetime) -> datetime:
    """Convert any datetime to IST timezone.

    - If already IST, return as-is
    - If naive (no tzinfo), treat as UTC and convert to IST
    - If other timezone, convert to IST
    """
    if dt.tzinfo is None:
        # Treat naive datetime as UTC (common from DBs) and convert to IST
        dt = dt.replace(tzinfo=timezone.utc)
    # If already IST, astimezone returns the same instant
    return dt.astimezone(IST)
