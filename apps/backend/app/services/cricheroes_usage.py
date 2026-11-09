"""Counting CricHeroes calls against the annual quota.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6.6. CricHeroes allow 100,000 calls
per 12-month term and only warn at 80% (§6.1), which is too late to change a
schedule cheaply. So every call is counted here, per day and endpoint, and
`usage` reports the term so far against the quota.

The count errs high. A request we stopped waiting for -- timed out, or
cancelled -- may well have been answered and charged, so it counts as a call;
only a request that never left (the connection failed) does not. A counter
that reads low is the one that lets the quota run out.

Build every client through `counted_client`: a client built directly calls
CricHeroes all the same, but nothing counts it.
"""

import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, Optional, Tuple

from pymongo.errors import DuplicateKeyError

from app.common.datetime_utils import utc_now
from app.models.cricheroes import CricHeroesCallCount
from app.schemas.admin.cricheroes_ops import DayUsage, UsageReport
from app.services.cricheroes_client import CricHeroesClient
from config.settings import get_settings

logger = logging.getLogger("app.cricheroes")


def counted_client(**options: Any) -> CricHeroesClient:
    """A CricHeroes client whose every call is counted."""
    return CricHeroesClient(recorder=record_call, **options)


async def record_call(
    endpoint: str,
    status: Optional[int],
    sent: bool = True,
    *,
    now: Optional[datetime] = None,
) -> None:
    """Count one request to `endpoint`.

    `status` is the HTTP status CricHeroes answered with, or None when no
    answer came; `sent` is False only when the request never left.
    """
    day = (now or utc_now()).date().isoformat()
    if not sent:
        increments = {"not_sent": 1}
    else:
        increments = {"calls": 1}
        if status is None:
            increments["no_answer"] = 1
        elif status == 429:
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


def _anniversary(start: date, year: int) -> date:
    try:
        return start.replace(year=year)
    except ValueError:  # 29 February
        return start.replace(year=year, day=28)


def term_start(today: date) -> Tuple[date, bool]:
    """The current quota term's first day, and whether it was configured.

    The term renews every year on the anniversary of
    CRICHEROES_QUOTA_TERM_START, so the current one starts on the latest
    anniversary on or before today -- whatever year was configured, so a date
    still to come, or a mistyped year, cannot hide this term's calls. Unset,
    the last 365 days stand in for it.
    """
    configured = get_settings().cricheroes_quota_term_start
    if configured is None:
        return today - timedelta(days=364), False
    start = _anniversary(configured, today.year)
    if start > today:
        start = _anniversary(configured, today.year - 1)
    return start, True


async def usage(days: int = 30, *, today: Optional[date] = None) -> UsageReport:
    """Calls this quota term, and per day and per endpoint for recent days."""
    settings = get_settings()
    today = today or utc_now().date()
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
        bucket.not_sent += row.not_sent
        by_endpoint[row.endpoint] = by_endpoint.get(row.endpoint, 0) + row.calls

    quota = settings.cricheroes_annual_quota
    percent = round(100 * this_term / quota, 2)
    return UsageReport(
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


def warn_if_over(report: UsageReport) -> bool:
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
