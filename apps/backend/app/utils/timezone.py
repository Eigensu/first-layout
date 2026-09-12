"""IST timezone utilities for consistent datetime handling across the application."""

from datetime import datetime, timedelta, timezone

# IST is UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    """Return current datetime in IST timezone."""
    return datetime.now(IST)


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


def parse_ist(date_str: str) -> datetime:
    """Parse ISO string as IST datetime.

    Handles:
    - Naive ISO strings (assumes UTC then converts to IST): "2025-11-02T00:00:00"
    - ISO with offset: "2025-11-02T00:00:00+05:30"
    - ISO with Z: "2025-11-01T18:30:00Z" (converts to IST)
    """
    dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    return to_ist(dt)
