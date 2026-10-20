from datetime import datetime

from beanie import Document
from pymongo import IndexModel


class RateLimitCounter(Document):
    """Requests counted against one rate-limit key in one window.

    Written only by app/utils/rate_limit.py, as a single upsert per request.
    `key` names the rule, the axis, a hash of the value being limited (never
    the address or identifier itself) and the window's start, so each window
    is its own row and MongoDB deletes it once `expires_at` has passed.

    Platform-wide, with no tournament_id: one account signs in to every
    tournament, so an attacker must not get a fresh allowance per tournament.
    """

    key: str
    count: int = 0
    expires_at: datetime

    class Settings:
        name = "rate_limit_counters"
        indexes = [
            IndexModel([("key", 1)], name="uniq_key", unique=True),
            IndexModel([("expires_at", 1)], name="ttl_expires_at", expireAfterSeconds=0),
        ]
