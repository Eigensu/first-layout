"""The CricHeroes call counter (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6.6).

The client tells a recorder of every attempt; record_call keeps one row per
day and endpoint; usage() reports the quota term against the quota.
"""

import asyncio
import logging
from datetime import date, datetime, timezone

import httpx
import pytest
import pytest_asyncio
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

from app.common.datetime_utils import utc_now
from app.models.cricheroes import CricHeroesCallCount
from app.routes.admin.cricheroes import get_cricheroes_client
from app.services import cricheroes_usage
from app.services.cricheroes_client import CricHeroesClient
from app.services.cricheroes_errors import (
    CricHeroesRateLimitError,
    CricHeroesTransportError,
)
from app.services.cricheroes_usage import record_call, term_start, usage, warn_if_over
from config.settings import Settings, get_settings

BASE = "https://cricheroes.test/api/v1"
CREDS = {"api_key": "k", "secret_access_key": "s", "udid": "u"}


def ok(data=None) -> httpx.Response:
    return httpx.Response(200, json={"status": True, "data": data or []})


@pytest_asyncio.fixture
async def recorded_client():
    """A client over a scripted upstream, recording what it is told."""
    opened = []

    def _make(*responses, recorder=None, **options):
        script = list(responses)
        told = []

        async def record(endpoint, status, sent):
            told.append((endpoint, status, sent))

        async def answer(request):
            response = script.pop(0) if len(script) > 1 else script[0]
            if callable(response):
                response = await response()
            if isinstance(response, Exception):
                raise response
            return response

        http = httpx.AsyncClient(transport=httpx.MockTransport(answer))
        opened.append(http)

        async def no_sleep(seconds):
            pass

        client = CricHeroesClient(
            **CREDS,
            base_url=BASE,
            client=http,
            sleep=no_sleep,
            recorder=recorder or record,
            **options,
        )
        return client, told

    yield _make
    for http in opened:
        await http.aclose()


@pytest.fixture
def settings(monkeypatch):
    current = get_settings()
    monkeypatch.setattr(current, "cricheroes_quota_term_start", None)
    monkeypatch.setattr(current, "cricheroes_annual_quota", 100_000)
    monkeypatch.setattr(current, "cricheroes_usage_warn_percent", 50.0)
    return current


async def rows():
    return {
        (r.day, r.endpoint): (
            r.calls,
            r.throttled,
            r.server_errors,
            r.no_answer,
            r.not_sent,
        )
        for r in await CricHeroesCallCount.find_all().to_list()
    }


# -- the client tells the recorder of every attempt ---------------------------


async def test_each_call_is_reported_with_its_endpoint_and_status(recorded_client):
    client, told = recorded_client(ok())

    await client.get_tournament_point_table(2242502, round_id=4)
    await client.get_match_partnership(458328, 362504)

    # The endpoint, without ids or parameters.
    assert told == [
        ("get-tournament-point-table", 200, True),
        ("get-match-partnership", 200, True),
    ]


async def test_every_retried_429_is_reported_too(recorded_client):
    """CricHeroes charge each 429, so each attempt counts, not each call."""
    client, told = recorded_client(
        httpx.Response(429), httpx.Response(429), ok(), max_retries=2
    )

    await client.get_tournament_match_list(2242502)

    assert told == [("get-tournament-match-list", s, True) for s in (429, 429, 200)]


async def test_a_429_that_ends_the_call_is_reported(recorded_client):
    client, told = recorded_client(httpx.Response(429), max_retries=0)

    with pytest.raises(CricHeroesRateLimitError):
        await client.get_tournament_match_list(2242502)

    assert told == [("get-tournament-match-list", 429, True)]


@pytest.mark.parametrize(
    "failure", [httpx.ConnectError("refused"), httpx.ConnectTimeout("slow")]
)
async def test_a_request_that_never_left_is_reported_as_not_sent(
    recorded_client, failure
):
    client, told = recorded_client(failure)

    with pytest.raises(CricHeroesTransportError):
        await client.get_tournament_match_list(2242502)

    assert told == [("get-tournament-match-list", None, False)]


@pytest.mark.parametrize(
    "failure", [httpx.ReadTimeout("slow"), httpx.RemoteProtocolError("cut")]
)
async def test_a_request_sent_but_unanswered_is_reported_as_sent(
    recorded_client, failure
):
    """CricHeroes may have answered, and charged, after we stopped waiting."""
    client, told = recorded_client(failure)

    with pytest.raises(CricHeroesTransportError):
        await client.get_tournament_match_list(2242502)

    assert told == [("get-tournament-match-list", None, True)]


async def test_our_own_deadline_counts_as_sent(recorded_client):
    async def slow():
        await asyncio.sleep(1)
        return ok()

    client, told = recorded_client(slow, timeout=0.05)

    with pytest.raises(CricHeroesTransportError):
        await client.get_tournament_match_list(2242502)

    assert told == [("get-tournament-match-list", None, True)]


async def test_a_cancelled_request_is_still_counted(recorded_client):
    """The player import cancels its other squad reads when one fails; each
    was already sent, and may be charged."""
    started = asyncio.Event()

    async def waits():
        started.set()
        await asyncio.sleep(10)
        return ok()

    client, told = recorded_client(waits)
    call = asyncio.create_task(client.get_tournament_match_list(2242502))
    await started.wait()
    call.cancel()

    with pytest.raises(asyncio.CancelledError):
        await call

    assert told == [("get-tournament-match-list", None, True)]


async def test_errors_are_reported_before_they_are_raised(recorded_client):
    client, told = recorded_client(httpx.Response(500, text="down"))

    with pytest.raises(Exception):
        await client.get_tournament_match_list(2242502)

    assert told == [("get-tournament-match-list", 500, True)]


async def test_a_counter_that_fails_never_fails_the_call(recorded_client, caplog):
    async def broken(endpoint, status, sent):
        raise RuntimeError("database down")

    client, _ = recorded_client(ok([]), recorder=broken)

    with caplog.at_level(logging.ERROR, logger="app.cricheroes"):
        assert await client.get_tournament_match_list(2242502) == []

    assert "Could not count a CricHeroes call" in caplog.text


async def test_the_routes_count_their_calls(db):
    """The route dependency is the counted client, so admin calls and the
    player import are counted without anything further."""
    dependency = get_cricheroes_client()
    client = await dependency.__anext__()
    try:
        assert client._recorder is record_call
    finally:
        await dependency.aclose()


# -- record_call -------------------------------------------------------------

NOON = datetime(2026, 11, 5, 12, tzinfo=timezone.utc)


async def test_calls_are_counted_per_day_and_endpoint(db):
    await record_call("get-tournament-match-list", 200, now=NOON)
    await record_call("get-tournament-match-list", 200, now=NOON)
    await record_call("get-tournament-point-table", 200, now=NOON)
    await record_call(
        "get-tournament-match-list",
        200,
        now=datetime(2026, 11, 6, 0, 0, 1, tzinfo=timezone.utc),
    )

    assert await rows() == {
        ("2026-11-05", "get-tournament-match-list"): (2, 0, 0, 0, 0),
        ("2026-11-05", "get-tournament-point-table"): (1, 0, 0, 0, 0),
        ("2026-11-06", "get-tournament-match-list"): (1, 0, 0, 0, 0),
    }


async def test_429s_and_5xx_are_charged_calls_and_counted_apart(db):
    await record_call("get-tournament-match-list", 429, now=NOON)
    await record_call("get-tournament-match-list", 503, now=NOON)
    await record_call("get-tournament-match-list", 403, now=NOON)

    assert await rows() == {
        ("2026-11-05", "get-tournament-match-list"): (3, 1, 1, 0, 0)
    }


async def test_unanswered_is_a_call_and_unsent_is_not(db):
    await record_call("get-tournament-match-list", None, now=NOON)
    await record_call("get-tournament-match-list", None, False, now=NOON)

    assert await rows() == {
        ("2026-11-05", "get-tournament-match-list"): (1, 0, 0, 1, 1)
    }


async def test_two_first_calls_of_a_day_racing_both_count(db, monkeypatch):
    """The second upsert of a new row can lose the race to insert it."""
    await record_call("get-tournament-match-list", 200, now=NOON)
    collection = CricHeroesCallCount.get_motor_collection()
    real = collection.update_one
    attempts = []

    async def loses_the_race_once(*args, **kwargs):
        attempts.append(1)
        if len(attempts) == 1:
            raise DuplicateKeyError("E11000 duplicate key")
        return await real(*args, **kwargs)

    monkeypatch.setattr(collection, "update_one", loses_the_race_once)
    monkeypatch.setattr(
        CricHeroesCallCount, "get_motor_collection", classmethod(lambda cls: collection)
    )

    await record_call("get-tournament-match-list", 200, now=NOON)

    assert len(attempts) == 2
    assert (await rows())[("2026-11-05", "get-tournament-match-list")][0] == 2


async def test_the_day_is_utc(db):
    # 23:30 on the 5th in UTC is the 6th in India.
    await record_call(
        "get-tournament-match-list",
        200,
        now=datetime(2026, 11, 5, 23, 30, tzinfo=timezone.utc),
    )

    assert list(await rows()) == [("2026-11-05", "get-tournament-match-list")]


# -- usage --------------------------------------------------------------------


async def count(day: str, endpoint: str, calls: int, **others):
    await CricHeroesCallCount(
        day=day, endpoint=endpoint, calls=calls, **others
    ).insert()


async def test_usage_reports_the_term_and_recent_days(db, settings):
    await count("2026-11-05", "get-tournament-match-list", 30, throttled=1)
    await count("2026-11-05", "get-tournament-point-table", 5)
    await count("2026-11-03", "get-tournament-match-list", 20, no_answer=2)
    await count("2026-06-01", "get-tournament-match-list", 1000)
    await count("2025-11-05", "get-tournament-match-list", 99999)  # a year ago

    report = await usage(days=3, today=date(2026, 11, 5))

    # No term start configured: the last 365 days.
    assert (report.term_start, report.term_start_configured) == (
        date(2025, 11, 6),
        False,
    )
    assert report.calls_this_term == 1055
    assert (report.quota, report.percent_used, report.over_warning) == (
        100_000,
        1.05,
        False,
    )
    # Every day of the window, newest first, empty days included.
    assert [(d.day, d.calls, d.throttled, d.no_answer) for d in report.days] == [
        ("2026-11-05", 35, 1, 0),
        ("2026-11-04", 0, 0, 0),
        ("2026-11-03", 20, 0, 2),
    ]
    assert report.by_endpoint == {
        "get-tournament-match-list": 50,
        "get-tournament-point-table": 5,
    }


@pytest.mark.parametrize(
    "configured",
    [date(2025, 3, 1), date(2024, 3, 1), date(2027, 3, 1)],
    ids=["last-year", "years-ago", "a-year-still-to-come"],
)
def test_the_term_is_the_latest_anniversary(settings, monkeypatch, configured):
    """Whatever the year, a date still to come or a mistyped one included,
    the term runs from the last 1 March: it cannot hide this term's calls."""
    monkeypatch.setattr(settings, "cricheroes_quota_term_start", configured)

    assert term_start(date(2026, 11, 5)) == (date(2026, 3, 1), True)
    assert term_start(date(2026, 2, 1)) == (date(2025, 3, 1), True)


async def test_a_configured_term_renews_every_year(db, settings, monkeypatch):
    monkeypatch.setattr(settings, "cricheroes_quota_term_start", date(2025, 3, 1))
    await count("2026-02-28", "get-tournament-match-list", 10)
    await count("2026-03-01", "get-tournament-match-list", 7)

    report = await usage(days=1, today=date(2026, 11, 5))

    assert (report.term_start, report.term_start_configured) == (
        date(2026, 3, 1),
        True,
    )
    assert report.calls_this_term == 7


def test_a_term_from_29_february_renews_on_the_28th(settings, monkeypatch):
    monkeypatch.setattr(settings, "cricheroes_quota_term_start", date(2024, 2, 29))

    assert term_start(date(2025, 3, 1)) == (date(2025, 2, 28), True)


async def test_past_the_warning_share_is_flagged_and_logged(db, settings, caplog):
    await count("2026-11-05", "get-tournament-match-list", 50_000)

    report = await usage(days=1, today=date(2026, 11, 5))

    assert report.over_warning
    with caplog.at_level(logging.WARNING, logger="app.cricheroes"):
        assert warn_if_over(report)
    assert "50000 of 100000" in caplog.text


# -- the usage route -------------------------------------------------------


async def test_the_usage_route(client, settings):
    today = utc_now().date().isoformat()
    await count(today, "get-tournament-match-list", 12)

    response = await client.get("/api/admin/cricheroes/usage", params={"days": 7})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["calls_this_term"] == 12
    assert len(body["days"]) == 7
    assert body["days"][0] == {
        "day": today,
        "calls": 12,
        "throttled": 0,
        "server_errors": 0,
        "no_answer": 0,
        "not_sent": 0,
    }
    assert body["by_endpoint"] == {"get-tournament-match-list": 12}


# -- settings ----------------------------------------------------------------


@pytest.mark.parametrize("value", ["abc", "2242502,-1", "2242502;2251924", "0"])
def test_sync_tournament_ids_are_checked_at_startup(value):
    with pytest.raises(ValidationError, match="CRICHEROES_SYNC_TOURNAMENT_IDS"):
        Settings(
            SECRET_KEY="x" * 32,
            JWT_SECRET_KEY="y" * 32,
            CRICHEROES_SYNC_TOURNAMENT_IDS=value,
        )


def test_sync_tournament_ids_are_read_as_numbers():
    current = Settings(
        SECRET_KEY="x" * 32,
        JWT_SECRET_KEY="y" * 32,
        CRICHEROES_SYNC_TOURNAMENT_IDS=" 2242502, 2251924,2242502,",
    )

    assert current.cricheroes_sync_tournaments == [2242502, 2251924]


@pytest.mark.parametrize("value", ["", "  "])
def test_a_blank_term_start_is_unset(value):
    """Added in Railway but left empty, it must not stop the API starting."""
    current = Settings(
        SECRET_KEY="x" * 32,
        JWT_SECRET_KEY="y" * 32,
        CRICHEROES_QUOTA_TERM_START=value,
    )

    assert current.cricheroes_quota_term_start is None


def test_counted_client_counts():
    assert cricheroes_usage.counted_client(**CREDS)._recorder is record_call
