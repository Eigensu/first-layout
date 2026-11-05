"""Counting CricHeroes calls against the annual quota.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6.6. CricHeroes allow 100,000 calls
per 12-month term and only warn at 80% (§6.1), which is too late to change a
schedule cheaply. So every call is counted here, per day and endpoint, and
`usage` reports the term so far against the quota.

Build every client through `counted_client`: a client built directly calls
CricHeroes all the same, but nothing counts it.
"""

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from pymongo.errors import DuplicateKeyError

from app.models.cricheroes import CricHeroesCallCount
from app.services.cricheroes_client import CricHeroesClient
from config.settings import get_settings

logger = logging.getLogger("app.cricheroes")


def counted_client(**options: Any) -> CricHeroesClient:
    """A CricHeroes client whose every call is counted."""
    return CricHeroesClient(recorder=record_call, **options)


async def record_call(
    endpoint: str, status: Optional[int], *, now: Optional[datetime] = None
) -> None:
    """Count one call to `endpoint`; `status` is None when no answer came."""
    day = (now or datetime.now(timezone.utc)).date().isoformat()
    if status is None:
        increments = {"no_answer": 1}
    else:
        increments = {"calls": 1}
        if status == 429:
            increments["throttled"] = 1
        elif status >= 500:
            increments["server_errors"] = 1
    collection = CricHeroesCallCount.get_motor_collection()
    query = {"day": day, "endpoint": endpoint}
    update = {"$inc": increments}
    try:
        await collection.update_one(query, update, upsert=True)
    except DuplicateKeyError:
        # The day's first two calls to an endpoint raced to insert its row.
        # It exists now, so the retry is a plain increment.
        await collection.update_one(query, update, upsert=True)


@dataclass
class DayUsage:
    day: str
    calls: int = 0
    throttled: int = 0
    server_errors: int = 0
    no_answer: int = 0


@dataclass
class Usage:
    term_start: date
    # False when CRICHEROES_QUOTA_TERM_START is unset and the term is taken to
    # be the last 365 days.
    term_start_configured: bool
    quota: int
    calls_this_term: int
    percent_used: float
    warn_percent: float
    over_warning: bool
    # The last `days` days, newest first, with every day present.
    days: List[DayUsage] = field(default_factory=list)
    # Calls per endpoint over those days, most called first.
    by_endpoint: Dict[str, int] = field(default_factory=dict)


def _year_later(day: date) -> date:
    try:
        return day.replace(year=day.year + 1)
    except ValueError:  # 29 February
        return day.replace(year=day.year + 1, day=28)


def term_start(today: date) -> tuple:
    """The current quota term's first day, and whether it was configured.

    The term is 12 months from CRICHEROES_QUOTA_TERM_START, renewing each year
    after; unset, the last 365 days stand in for it.
    """
    configured = get_settings().cricheroes_quota_term_start
    if configured is None:
        return today - timedelta(days=364), False
    start = configured
    while _year_later(start) <= today:
        start = _year_later(start)
    return start, True


async def usage(days: int = 30, *, today: Optional[date] = None) -> Usage:
    """Calls this quota term, and per day and per endpoint for recent days."""
    settings = get_settings()
    today = today or datetime.now(timezone.utc).date()
    start, configured = term_start(today)
    window_start = today - timedelta(days=days - 1)
    since = min(start, window_start).isoformat()

    rows = await CricHeroesCallCount.find({"day": {"$gte": since}}).to_list()

    per_day = {
        (today - timedelta(days=n)).isoformat(): DayUsage(
            day=(today - timedelta(days=n)).isoformat()
        )
        for n in range(days)
    }
    by_endpoint: Dict[str, int] = {}
    this_term = 0
    for row in rows:
        if row.day >= start.isoformat():
            this_term += row.calls
        bucket = per_day.get(row.day)
        if bucket is None:
            continue
        bucket.calls += row.calls
        bucket.throttled += row.throttled
        bucket.server_errors += row.server_errors
        bucket.no_answer += row.no_answer
        by_endpoint[row.endpoint] = by_endpoint.get(row.endpoint, 0) + row.calls

    quota = settings.cricheroes_annual_quota
    percent = round(100 * this_term / quota, 2)
    return Usage(
        term_start=start,
        term_start_configured=configured,
        quota=quota,
        calls_this_term=this_term,
        percent_used=percent,
        warn_percent=settings.cricheroes_usage_warn_percent,
        over_warning=percent >= settings.cricheroes_usage_warn_percent,
        days=sorted(per_day.values(), key=lambda d: d.day, reverse=True),
        by_endpoint=dict(sorted(by_endpoint.items(), key=lambda kv: (-kv[1], kv[0]))),
    )


def warn_if_over(report: Usage) -> bool:
    """Log a warning when the term's calls have passed the warning share."""
    if report.over_warning:
        logger.warning(
            "CricHeroes calls this quota term: %d of %d (%.1f%%), past the "
            "%.0f%% warning (CRICHEROES_USAGE_WARN_PERCENT)",
            report.calls_this_term,
            report.quota,
            report.percent_used,
            report.warn_percent,
        )
    return report.over_warning
