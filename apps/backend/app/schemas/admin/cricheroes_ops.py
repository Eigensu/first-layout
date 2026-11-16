"""What the CricHeroes call counter and cache report
(docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6.6, §6.7, §9.3).

The services build these and the admin routes return them as they are, so each
shape is defined once.
"""

from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, computed_field


class DayUsage(BaseModel):
    day: str
    # Requests that reached CricHeroes, or may have: what they charge for,
    # 429s included. Errs high (§6.6).
    calls: int = 0
    throttled: int = 0
    server_errors: int = 0
    # Of `calls`, those we stopped waiting for: timed out or cancelled.
    no_answer: int = 0
    # Requests that never left: the connection failed. Not in `calls`.
    not_sent: int = 0


class UsageReport(BaseModel):
    term_start: date
    # False: CRICHEROES_QUOTA_TERM_START is unset, so the last 365 days stand
    # in for the term.
    term_start_configured: bool
    quota: int
    calls_this_term: int
    percent_used: float
    warn_percent: float
    over_warning: bool
    # The last `days` days, newest first, every day present.
    days: List[DayUsage] = Field(default_factory=list)
    # Calls per endpoint over those days, most called first.
    by_endpoint: Dict[str, int] = Field(default_factory=dict)


class SnapshotStatus(BaseModel):
    resource: str
    cricheroes_tournament_id: int
    fetched_at: Optional[datetime] = None
    rows: int = 0
    last_error: Optional[str] = None
    last_error_at: Optional[datetime] = None


class CacheStatusResponse(BaseModel):
    # The CricHeroes tournaments the scheduled sync keeps cached: every one a
    # tournament is linked to, less any held back by CRICHEROES_SYNC_TOURNAMENT_IDS.
    tournaments: List[int]
    # Linked, but outside CRICHEROES_SYNC_TOURNAMENT_IDS, so never refreshed.
    # Empty unless that cap is set.
    linked_not_synced: List[int] = Field(default_factory=list)
    max_age_hours: float
    snapshots: List[SnapshotStatus]


class SyncReport(BaseModel):
    """One tournament's refresh."""

    tournament_id: int
    # Resources read from CricHeroes; each was one request.
    refreshed: List[str] = Field(default_factory=list)
    # Resources whose cached copy was still current: no request.
    unchanged: List[str] = Field(default_factory=list)
    # The refreshed resources CricHeroes have no data for yet -- before the
    # first match, say -- cached as empty tables rather than failed (spec
    # §6.7). Each is also in `refreshed`.
    no_data_yet: List[str] = Field(default_factory=list)
    # Resource -> why it could not be read; its cached copy was kept.
    failed: Dict[str, str] = Field(default_factory=dict)
    # Set when the whole tournament was passed over, with the reason.
    skipped: Optional[str] = None
    results_changed: bool = False
    # Contest points (spec §9.3): the matches whose MVP table was read, each
    # one request; the ones whose read failed (match id -> why); and how many
    # opted-in contests were scored, and which could not be (code -> why).
    mvp_tables_read: List[int] = Field(default_factory=list)
    mvp_tables_failed: Dict[str, str] = Field(default_factory=dict)
    contests_scored: int = 0
    contests_failed: Dict[str, str] = Field(default_factory=dict)

    @computed_field
    @property
    def calls(self) -> int:
        """Requests made to CricHeroes for this tournament in this run."""
        return (
            len(self.refreshed)
            + len(self.failed)
            + len(self.mvp_tables_read)
            + len(self.mvp_tables_failed)
        )


class RefreshResponse(BaseModel):
    reports: List[SyncReport]
