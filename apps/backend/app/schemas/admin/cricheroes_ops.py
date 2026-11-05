"""Responses of the CricHeroes call-counter and cache admin routes
(docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6.6, §6.7)."""

from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel


class DayUsage(BaseModel):
    day: str
    # Requests CricHeroes answered: what they charge for, 429s included.
    calls: int
    throttled: int
    server_errors: int
    # Requests that got no answer at all; not in `calls`.
    no_answer: int


class UsageResponse(BaseModel):
    term_start: date
    # False: CRICHEROES_QUOTA_TERM_START is unset, so the last 365 days stand
    # in for the term.
    term_start_configured: bool
    quota: int
    calls_this_term: int
    percent_used: float
    warn_percent: float
    over_warning: bool
    days: List[DayUsage]
    by_endpoint: Dict[str, int]


class SnapshotStatus(BaseModel):
    resource: str
    cricheroes_tournament_id: int
    fetched_at: Optional[datetime] = None
    rows: int
    last_error: Optional[str] = None
    last_error_at: Optional[datetime] = None


class CacheStatusResponse(BaseModel):
    # CRICHEROES_SYNC_TOURNAMENT_IDS.
    tournaments: List[int]
    max_age_hours: float
    snapshots: List[SnapshotStatus]


class SyncReport(BaseModel):
    tournament_id: int
    refreshed: List[str]
    unchanged: List[str]
    failed: Dict[str, str]
    skipped: Optional[str] = None
    results_changed: bool
    # Requests made to CricHeroes for this tournament in this run.
    calls: int


class RefreshResponse(BaseModel):
    reports: List[SyncReport]
