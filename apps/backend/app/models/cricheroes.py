"""What we keep from the CricHeroes API: how many calls we made, the last
answer for each resource we keep cached, and each completed match's MVP table.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6.6 (the call counter), §6.7 (the
cache) and §9.3 (contest points). All are platform-wide, with no
tournament_id: the call quota is one
per CricHeroes account, and a CricHeroes tournament id is unrelated to our own
tournaments (§13.1).
"""

from datetime import datetime
from typing import Any, List, Optional

from beanie import Document
from pydantic import Field
from pymongo import IndexModel


class CricHeroesCallCount(Document):
    """Calls made to one CricHeroes endpoint on one day (UTC).

    Written only by app/services/cricheroes_usage.py, as one upsert per call.
    `calls` is every request that reached CricHeroes or may have: what they
    charge for, a 429 included (§13.4), erring high. Among them, `throttled`
    and `server_errors` are the 429s and 5xx -- CricHeroes do not charge
    calls lost to their own outages (§6.1), so the 5xx are the likeliest
    refund -- and `no_answer` the ones we stopped waiting for (timed out or
    cancelled), which may have been answered and charged all the same.
    `not_sent` is requests whose connection failed: never sent, not in
    `calls`.
    """

    day: str  # "2026-11-05", UTC
    endpoint: str  # the upstream endpoint, e.g. "get-tournament-match-list"
    calls: int = 0
    throttled: int = 0
    server_errors: int = 0
    no_answer: int = 0
    not_sent: int = 0

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
    rows: int = 0  # entries in `data`, so a status view need not load it
    fetched_at: Optional[datetime] = None
    # For the match list, a digest of the completed matches' results. For every
    # other resource, the match list's digest when it was fetched: a resource
    # whose digest is behind the match list's is due a refresh (§6.7).
    results_digest: Optional[str] = None
    # When CricHeroes first had no data for this table although a match was
    # over. While set, the table is read again with a doubling wait, not every
    # run (§6.7).
    empty_since: Optional[datetime] = None
    last_error: Optional[str] = None
    last_error_at: Optional[datetime] = None
    # On the match list's document only: when CricHeroes last refused the
    # tournament (170001). The scheduled run leaves it a day before asking
    # again (§6.7). Cleared by the next good read.
    refused_at: Optional[datetime] = None
    # On the match list's document only: when a refresh of the tournament
    # claimed it. One run at a time, across processes (§6.7).
    claimed_at: Optional[datetime] = None

    class Settings:
        name = "cricheroes_snapshots"
        indexes = [
            IndexModel([("key", 1)], name="uniq_key", unique=True),
        ]


class CricHeroesMatchMvp(Document):
    """The MVP table of one completed CricHeroes match, for contest points.

    Written only by app/services/cricheroes_points.py (spec §9.3). `data` is
    the rows as CricHeroes sent them, under their own field names, so they
    read back through `PlayerMvp`. A failed read keeps the last good `data`
    and records the failure in `last_error`.
    """

    match_id: int
    cricheroes_tournament_id: int
    data: List[Any] = Field(default_factory=list)
    fetched_at: Optional[datetime] = None
    # The match's result when its table was read: a corrected result makes
    # the table due again.
    result_key: Optional[str] = None
    # How many times the table has been read for this result. It is read once
    # when the match is completed and once more a day later, in case the
    # scorer corrected the scorecard; after that it is settled.
    reads: int = 0
    last_error: Optional[str] = None
    last_error_at: Optional[datetime] = None

    class Settings:
        name = "cricheroes_match_mvps"
        indexes = [
            IndexModel([("match_id", 1)], name="uniq_match_id", unique=True),
            "cricheroes_tournament_id",
        ]
