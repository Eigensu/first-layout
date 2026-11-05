"""The CricHeroes cache (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6.7).

A real CricHeroesClient over a scripted CricHeroes that answers each endpoint
with the API doc's example, so the cache is tested through the client and the
models it will meet in production.
"""

import copy
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from cricheroes_responses import refusal

from app.models.cricheroes import CricHeroesCallCount, CricHeroesSnapshot
from app.routes.admin.cricheroes import get_cricheroes_client
from app.services import cricheroes_cache
from app.services.cricheroes_cache import read, results_digest, sync, sync_tournament
from app.services.cricheroes_client import CricHeroesClient
from app.services.cricheroes_errors import CricHeroesConfigError
from app.services.cricheroes_usage import counted_client
from config.settings import get_settings

DOC = json.loads(
    (Path(__file__).parent / "fixtures" / "cricheroes_doc_examples.json").read_text()
)
BASE = "https://cricheroes.test/api/v1"
CREDS = {"api_key": "k", "secret_access_key": "s", "udid": "u"}
TPL = 2242502
DEPENDENTS = ["point-table", "mvp", "batting-leaderboard", "bowling-leaderboard"]
T0 = datetime(2026, 11, 5, 10, tzinfo=timezone.utc)

# The upstream endpoint behind each cached resource.
ENDPOINTS = {
    "matches": "get-tournament-match-list",
    "point-table": "get-tournament-point-table",
    "mvp": "get-tournament-player-mvp",
    "batting-leaderboard": "get-tournament-batting-leaderboard",
    "bowling-leaderboard": "get-tournament-bowling-leaderboard",
}


def ok(data) -> httpx.Response:
    return httpx.Response(200, json={"status": True, "data": data})


class CricHeroes:
    """Answers each endpoint with the doc's example unless told otherwise,
    and counts the calls each endpoint gets."""

    def __init__(self):
        self.answers = {e: ok(DOC[e]["data"]) for e in ENDPOINTS.values()}
        self.calls: dict = {}

    def matches(self, rows):
        self.answers["get-tournament-match-list"] = ok(rows)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        endpoint = request.url.path.split("/")[-2]
        self.calls[endpoint] = self.calls.get(endpoint, 0) + 1
        answer = self.answers[endpoint]
        if isinstance(answer, Exception):
            raise answer
        return answer

    def total(self) -> int:
        return sum(self.calls.values())

    def reset(self):
        self.calls = {}


@pytest.fixture(autouse=True)
def _fresh_locks():
    cricheroes_cache._locks.clear()


@pytest_asyncio.fixture
async def upstream(db):
    cricheroes = CricHeroes()
    http = httpx.AsyncClient(transport=httpx.MockTransport(cricheroes))
    cricheroes.client = CricHeroesClient(**CREDS, base_url=BASE, client=http)
    yield cricheroes
    await http.aclose()


@pytest.fixture
def configured(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "cricheroes_sync_tournament_ids", str(TPL))
    monkeypatch.setattr(settings, "cricheroes_snapshot_max_age_hours", 24.0)
    return settings


def completed(match_id: int, **changes) -> dict:
    row = copy.deepcopy(DOC["get-tournament-match-list"]["data"][0])
    row.update(match_id=match_id, **changes)
    return row


async def snapshot(resource: str) -> CricHeroesSnapshot:
    return await CricHeroesSnapshot.find_one(
        CricHeroesSnapshot.key == f"{resource}:{TPL}"
    )


# -- the first run, and reading back ------------------------------------------


async def test_the_first_run_reads_everything(upstream, configured):
    report = await sync_tournament(upstream.client, TPL, now=T0)

    assert report.refreshed == ["matches", *DEPENDENTS]
    assert (report.unchanged, report.failed, report.calls) == ([], {}, 5)
    assert report.results_changed
    assert upstream.calls == {endpoint: 1 for endpoint in ENDPOINTS.values()}


async def test_what_is_read_back_matches_a_live_call(upstream, configured):
    await sync_tournament(upstream.client, TPL, now=T0)

    live = await upstream.client.get_tournament_point_table(TPL)
    cached = await read("point-table", TPL)

    # Stored under CricHeroes' names and read back through the same model.
    stored = (await snapshot("point-table")).data[0]
    assert (stored["Team Name"], stored["Net RR"]) == ("Australia (WC19)", "1.065")
    assert cached.data == live
    assert cached.data[0].team_name == "Australia (WC19)"
    assert cached.fetched_at == T0 and cached.last_error is None
    batting = (await read("batting-leaderboard", TPL)).data
    assert (batting[0].fours, batting[0].strike_rate) == (67, "98.33")
    assert (await read("mvp", TPL)).data[0].total == "94.183"


async def test_nothing_cached_reads_as_none(db):
    assert await read("point-table", TPL) is None


# -- what a later run reads ---------------------------------------------------


async def test_unchanged_results_cost_one_call(upstream, configured):
    await sync_tournament(upstream.client, TPL, now=T0)
    upstream.reset()

    report = await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=1))

    assert report.refreshed == ["matches"]
    assert report.unchanged == DEPENDENTS
    assert not report.results_changed
    assert upstream.calls == {"get-tournament-match-list": 1}
    # The match list itself is always current.
    assert (await snapshot("matches")).fetched_at.replace(
        tzinfo=timezone.utc
    ) == T0 + timedelta(hours=1)


async def test_a_completed_match_refreshes_everything(upstream, configured):
    await sync_tournament(upstream.client, TPL, now=T0)
    upstream.matches(DOC["get-tournament-match-list"]["data"] + [completed(999)])
    upstream.reset()

    report = await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=1))

    assert report.results_changed
    assert report.refreshed == ["matches", *DEPENDENTS]
    assert upstream.total() == 5


async def test_a_corrected_result_refreshes_everything(upstream, configured):
    await sync_tournament(upstream.client, TPL, now=T0)
    rows = copy.deepcopy(DOC["get-tournament-match-list"]["data"])
    rows[0]["winning_team_id"] = "362535"
    upstream.matches(rows)

    report = await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=1))

    assert report.results_changed and report.unchanged == []


async def test_play_in_progress_does_not(upstream, configured):
    """Scores of a live match change every run; the standings do not."""
    played = DOC["get-tournament-match-list"]["data"]
    upstream.matches(
        played + [completed(5, type=1, status="live", team_a_summary="45/1")]
    )
    await sync_tournament(upstream.client, TPL, now=T0)
    upstream.matches(
        played + [completed(5, type=1, status="live", team_a_summary="98/3")]
    )
    upstream.reset()

    report = await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=1))

    assert not report.results_changed
    assert upstream.calls == {"get-tournament-match-list": 1}
    # The live score itself is in the match list, which is current.
    live = [m for m in (await read("matches", TPL)).data if m.match_id == 5]
    assert live[0].team_a_summary == "98/3"


async def test_old_data_is_refreshed_even_without_a_result(upstream, configured):
    await sync_tournament(upstream.client, TPL, now=T0)
    upstream.reset()

    report = await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=24))

    assert report.refreshed == ["matches", *DEPENDENTS]
    assert not report.results_changed


async def test_force_reads_everything(upstream, configured):
    await sync_tournament(upstream.client, TPL, now=T0)
    upstream.reset()

    report = await sync_tournament(
        upstream.client, TPL, now=T0 + timedelta(hours=1), force=True
    )

    assert report.refreshed == ["matches", *DEPENDENTS]


@pytest.mark.parametrize("force", [False, True])
async def test_a_second_run_within_minutes_calls_nothing(upstream, configured, force):
    await sync_tournament(upstream.client, TPL, now=T0)
    upstream.reset()

    report = await sync_tournament(
        upstream.client, TPL, now=T0 + timedelta(minutes=4), force=force
    )

    assert report.skipped == "refreshed 4 minute(s) ago"
    assert upstream.total() == 0 and report.calls == 0


# -- failures -------------------------------------------------------------------


async def test_a_failed_resource_keeps_its_data_and_is_retried(upstream, configured):
    await sync_tournament(upstream.client, TPL, now=T0)
    upstream.matches(DOC["get-tournament-match-list"]["data"] + [completed(999)])
    upstream.answers["get-tournament-player-mvp"] = httpx.Response(500, text="down")

    report = await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=1))

    assert list(report.failed) == ["mvp"]
    assert report.refreshed == ["matches", "point-table", *DEPENDENTS[2:]]
    mvp = await read("mvp", TPL)
    assert mvp.fetched_at == T0 and len(mvp.data) == 2
    assert "HTTP 500" in mvp.last_error

    # Results have not changed since, but the MVP table is still behind them.
    upstream.answers["get-tournament-player-mvp"] = ok(
        DOC["get-tournament-player-mvp"]["data"]
    )
    upstream.reset()
    report = await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=2))

    assert report.refreshed == ["matches", "mvp"]
    assert (await read("mvp", TPL)).last_error is None


async def test_without_the_match_list_nothing_else_is_read(upstream, configured):
    await sync_tournament(upstream.client, TPL, now=T0)
    upstream.answers["get-tournament-match-list"] = httpx.ConnectError("refused")
    upstream.reset()

    report = await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=1))

    assert list(report.failed) == ["matches"] and report.refreshed == []
    assert upstream.calls == {"get-tournament-match-list": 1}
    matches = await read("matches", TPL)
    assert matches.fetched_at == T0 and "refused" in matches.last_error
    assert len(matches.data) == 2


async def test_a_tournament_not_served_is_recorded_not_raised(upstream, configured):
    upstream.answers["get-tournament-match-list"] = refusal(
        170001, "Access to this tournament is not allowed.", status=403
    )

    report = await sync_tournament(upstream.client, TPL, now=T0)

    assert "do not give us access" in report.failed["matches"]


async def test_missing_credentials_stop_the_run(db, configured):
    client = CricHeroesClient(api_key="", secret_access_key="", udid="", base_url=BASE)

    with pytest.raises(CricHeroesConfigError):
        await sync(client)


def test_the_digest_covers_completed_results_only():
    from app.schemas.cricheroes import TournamentMatch

    played = [
        TournamentMatch.model_validate(r)
        for r in DOC["get-tournament-match-list"]["data"]
    ]
    live = TournamentMatch.model_validate(completed(5, type=1, status="live"))
    upcoming = TournamentMatch.model_validate(completed(6, type=2, status="upcoming"))

    assert results_digest(played) == results_digest(
        list(reversed(played)) + [live, upcoming]
    )
    assert results_digest(played) != results_digest(played[:1])


# -- sync() and the counter -------------------------------------------------------


async def test_sync_covers_the_configured_tournaments(
    upstream, configured, monkeypatch
):
    monkeypatch.setattr(configured, "cricheroes_sync_tournament_ids", f"{TPL},2251924")

    reports = await sync(upstream.client)

    assert [r.tournament_id for r in reports] == [TPL, 2251924]
    assert await CricHeroesSnapshot.find_all().count() == 10


async def test_a_counted_run_is_counted(upstream, configured):
    http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    try:
        async with counted_client(**CREDS, base_url=BASE, client=http) as client:
            await sync(client)
    finally:
        await http.aclose()

    rows = await CricHeroesCallCount.find_all().to_list()
    assert sorted(r.endpoint for r in rows) == sorted(ENDPOINTS.values())
    assert sum(r.calls for r in rows) == 5


# -- the admin routes ---------------------------------------------------------------


@pytest_asyncio.fixture
async def serve(upstream):
    from main import app

    async def _client():
        yield upstream.client

    app.dependency_overrides[get_cricheroes_client] = _client
    yield upstream
    app.dependency_overrides.pop(get_cricheroes_client, None)


async def test_refresh_now(client, serve, configured):
    response = await client.post("/api/admin/cricheroes/cache/refresh")

    assert response.status_code == 200, response.text
    [report] = response.json()["reports"]
    assert report["tournament_id"] == TPL
    assert report["refreshed"] == ["matches", *DEPENDENTS]
    assert report["calls"] == 5

    again = await client.post(
        "/api/admin/cricheroes/cache/refresh", params={"force": "true"}
    )
    assert again.json()["reports"][0]["skipped"].startswith("refreshed 0 minute")
    assert serve.total() == 5


async def test_refresh_now_only_for_configured_tournaments(client, serve, configured):
    response = await client.post(
        "/api/admin/cricheroes/cache/refresh", params={"tournament_id": 60214}
    )

    assert response.status_code == 422
    assert "CRICHEROES_SYNC_TOURNAMENT_IDS" in response.json()["detail"]
    assert serve.total() == 0


async def test_refresh_now_with_nothing_configured(client, serve, monkeypatch):
    monkeypatch.setattr(get_settings(), "cricheroes_sync_tournament_ids", "")

    response = await client.post("/api/admin/cricheroes/cache/refresh")

    assert response.status_code == 422
    assert serve.total() == 0


async def test_refresh_now_without_credentials_is_a_503(client, db, configured):
    from main import app

    async def _client():
        async with CricHeroesClient(
            api_key="", secret_access_key="", udid="", base_url=BASE
        ) as unconfigured:
            yield unconfigured

    app.dependency_overrides[get_cricheroes_client] = _client
    try:
        response = await client.post("/api/admin/cricheroes/cache/refresh")
    finally:
        app.dependency_overrides.pop(get_cricheroes_client, None)

    assert response.status_code == 503
    assert "CRICHEROES_API_KEY" in response.json()["detail"]


async def test_cache_status(client, serve, configured):
    serve.answers["get-tournament-player-mvp"] = httpx.Response(500, text="down")
    await client.post("/api/admin/cricheroes/cache/refresh")

    response = await client.get("/api/admin/cricheroes/cache")

    assert response.status_code == 200
    body = response.json()
    assert body["tournaments"] == [TPL] and body["max_age_hours"] == 24.0
    by_resource = {s["resource"]: s for s in body["snapshots"]}
    assert by_resource["point-table"]["rows"] == 3  # duplicates dropped
    assert by_resource["matches"]["rows"] == 2
    assert by_resource["mvp"]["rows"] == 0 and by_resource["mvp"]["fetched_at"] is None
    assert "HTTP 500" in by_resource["mvp"]["last_error"]
