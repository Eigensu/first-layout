"""Pins the datetime convention: store and compare in naive UTC, display in IST.

The convention exists because the Mongo client is not opened with tz_aware=True,
so every datetime read back from the database is naive. Mixing those with aware
values raises TypeError at comparison time, which is the failure this suite is
meant to catch before it reaches a route.
"""

import os
import re
from datetime import datetime, timedelta, timezone

import pytest

from app.common.datetime_utils import IST, to_ist, to_utc_naive, utc_now
from app.common.enums.contests import ContestStatus
from app.models.contest import Contest
from app.services.contest_status import compute_contest_status

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_utc_now_is_naive_and_utc():
    now = utc_now()
    assert now.tzinfo is None, "must be naive, to match what the driver returns"
    # Within a minute of real UTC, so it is genuinely UTC and not local time.
    delta = abs(now - datetime.now(timezone.utc).replace(tzinfo=None))
    assert delta < timedelta(minutes=1)


def test_to_utc_naive_normalizes_every_origin():
    instant = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)

    from_utc = to_utc_naive(instant)
    from_ist = to_utc_naive(instant.astimezone(IST))
    from_naive = to_utc_naive(datetime(2026, 3, 1, 12, 0))

    assert from_utc.tzinfo is None
    # An aware IST value is the same instant, so it must normalize identically.
    assert from_ist == from_utc
    # A naive value is assumed to already be UTC and passes through untouched.
    assert from_naive == from_utc


def test_naive_and_aware_compare_after_normalizing():
    """The bug this convention prevents: comparing the two raises TypeError."""
    aware = datetime.now(IST)
    naive = utc_now()

    with pytest.raises(TypeError):
        _ = aware < naive

    # Normalizing either side makes the comparison safe.
    assert isinstance(to_utc_naive(aware) < naive, bool)


def _contest(start, end):
    return Contest(
        code="T1",
        name="Test",
        start_at=start,
        end_at=end,
        status=ContestStatus.LIVE,
    )


async def test_contest_status_handles_naive_database_values(db):
    now = utc_now()
    contest = _contest(now - timedelta(hours=1), now + timedelta(hours=1))
    assert compute_contest_status(contest) == ContestStatus.ONGOING


async def test_contest_status_handles_aware_values(db):
    """A contest built in-process from parsed IST input is still aware."""
    now_aware = datetime.now(IST)
    contest = _contest(now_aware - timedelta(hours=1), now_aware + timedelta(hours=1))
    assert compute_contest_status(contest) == ContestStatus.ONGOING


async def test_contest_status_boundaries(db):
    now = utc_now()
    assert (
        compute_contest_status(_contest(now + timedelta(hours=1), now + timedelta(hours=2)))
        == ContestStatus.LIVE
    )
    assert (
        compute_contest_status(_contest(now - timedelta(hours=2), now - timedelta(hours=1)))
        == ContestStatus.COMPLETED
    )


def test_to_ist_still_renders_for_display():
    instant = datetime(2026, 3, 1, 6, 30)  # naive UTC
    rendered = to_ist(instant)
    assert rendered.utcoffset() == timedelta(hours=5, minutes=30)
    assert (rendered.hour, rendered.minute) == (12, 0)


def test_no_utcnow_calls_remain():
    """The stdlib's deprecated naive-UTC helper must not come back.

    It is deprecated from Python 3.12 and CI runs 3.13. Guards the migration: a
    new call would silently reintroduce the split this convention removed. The
    name is assembled below rather than written out, so this file does not
    match its own check.
    """
    needle = r"\b" + "utc" + "now" + r"\s*\("
    offenders = []
    for sub in ("app", "scripts", "tests"):
        for dirpath, _, filenames in os.walk(os.path.join(BACKEND_ROOT, sub)):
            for name in filenames:
                if not name.endswith(".py"):
                    continue
                path = os.path.join(dirpath, name)
                source = open(path).read()
                # datetime_utils names it deliberately in its docstring.
                if path.endswith("datetime_utils.py"):
                    continue
                if re.search(needle, source):
                    offenders.append(os.path.relpath(path, BACKEND_ROOT))
    assert offenders == [], f"use utc_now() instead: {offenders}"
