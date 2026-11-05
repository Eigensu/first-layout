"""What we keep from the CricHeroes API: how many calls we made, and the last
answer for each resource we keep cached.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6.6 (the call counter) and §6.7 (the
cache). Both are platform-wide, with no tournament_id: the call quota is one
per CricHeroes account, and a CricHeroes tournament id is unrelated to our own
tournaments (§13.1).
"""

from datetime import datetime
from typing import Any, Optional

from beanie import Document
from pymongo import IndexModel


class CricHeroesCallCount(Document):
    """Calls made to one CricHeroes endpoint on one day (UTC).

    Written only by app/services/cricheroes_usage.py, as one upsert per call.
    `calls` is every request CricHeroes answered, which is what they charge
    for -- a 429 included (§13.4). `throttled` and `server_errors` are the 429s
    and 5xx among them; CricHeroes do not charge calls lost to their own
    outages (§6.1), so the 5xx are the likeliest to be refunded. `no_answer`
    is requests that never got an HTTP answer (timeout, connection failure),
    which are not in `calls`.
    """

    day: str  # "2026-11-05", UTC
    endpoint: str  # the upstream endpoint, e.g. "get-tournament-match-list"
    calls: int = 0
    throttled: int = 0
    server_errors: int = 0
    no_answer: int = 0

    class Settings:
        name = "cricheroes_call_counts"
        indexes = [
            IndexModel(
                [("day", 1), ("endpoint", 1)], name="uniq_day_endpoint", unique=True
            ),
        ]


class CricHeroesSnapshot(Document):
    """The last good answer for one cached resource of one CricHeroes tournament.

    Written only by app/services/cricheroes_cache.py. `data` is the parsed
    answer, stored under CricHeroes' own field names so it reads back through
    the same models as a live call. A failed refresh keeps the last good
    `data` and records the failure in `last_error`.
    """

    key: str  # "<resource>:<cricheroes tournament id>"
    resource: str  # "matches", "point-table", "mvp", ...
    cricheroes_tournament_id: int
    data: Any = None
    fetched_at: Optional[datetime] = None
    # For the match list, a digest of the completed matches' results. For every
    # other resource, the match list's digest when it was fetched: a resource
    # whose digest is behind the match list's is due a refresh (§6.7).
    results_digest: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[datetime] = None

    class Settings:
        name = "cricheroes_snapshots"
        indexes = [
            IndexModel([("key", 1)], name="uniq_key", unique=True),
        ]
