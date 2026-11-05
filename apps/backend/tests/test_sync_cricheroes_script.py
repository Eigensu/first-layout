"""scripts/sync_cricheroes.py: what the scheduled run does and how it exits."""

import json
from pathlib import Path

import httpx
import pytest
import pytest_asyncio

import scripts.sync_cricheroes as script
from app.models.cricheroes import CricHeroesCallCount
from app.services import cricheroes_cache, cricheroes_usage
from app.services.cricheroes_client import CricHeroesClient
from config.settings import get_settings

DOC = json.loads(
    (Path(__file__).parent / "fixtures" / "cricheroes_doc_examples.json").read_text()
)
BASE = "https://cricheroes.test/api/v1"
CREDS = {"api_key": "k", "secret_access_key": "s", "udid": "u"}


@pytest.fixture(autouse=True)
def _fresh_locks():
    cricheroes_cache._locks.clear()


@pytest_asyncio.fixture
async def upstream(db, monkeypatch):
    """Every endpoint answers with the doc's example, unless set otherwise."""
    answers: dict = {}

    def answer(request):
        endpoint = request.url.path.split("/")[-2]
        if endpoint in answers:
            return answers[endpoint]
        return httpx.Response(200, json={"status": True, "data": DOC[endpoint]["data"]})

    http = httpx.AsyncClient(transport=httpx.MockTransport(answer))
    creds = dict(CREDS)

    def client(**options):
        return CricHeroesClient(
            **creds,
            base_url=BASE,
            client=http,
            recorder=cricheroes_usage.record_call,
            **options,
        )

    monkeypatch.setattr(cricheroes_usage, "counted_client", client)
    settings = get_settings()
    monkeypatch.setattr(settings, "cricheroes_sync_tournament_ids", "2242502")
    yield answers, creds
    await http.aclose()


async def test_the_scheduled_run(upstream, capsys):
    assert await script.run(script.parse_args([])) == 0

    out = capsys.readouterr().out
    assert "2242502: 5 call(s); refreshed matches, point-table, mvp" in out
    assert "Calls this quota term: 5 of 100000" in out
    assert sum(r.calls for r in await CricHeroesCallCount.find_all().to_list()) == 5


async def test_a_failure_exits_1(upstream, capsys):
    answers, _ = upstream
    answers["get-tournament-player-mvp"] = httpx.Response(500, text="down")

    assert await script.run(script.parse_args([])) == 1

    assert "FAILED mvp: CricHeroes returned HTTP 500" in capsys.readouterr().out


async def test_missing_credentials_exit_1_without_a_call(upstream, capsys):
    _, creds = upstream
    creds.update(api_key="")

    assert await script.run(script.parse_args([])) == 1

    assert "CRICHEROES_API_KEY" in capsys.readouterr().out
    assert await CricHeroesCallCount.find_all().count() == 0


async def test_nothing_configured_is_not_a_failure(upstream, capsys, monkeypatch):
    monkeypatch.setattr(get_settings(), "cricheroes_sync_tournament_ids", "")

    assert await script.run(script.parse_args([])) == 0

    assert "CRICHEROES_SYNC_TOURNAMENT_IDS is empty" in capsys.readouterr().out


async def test_only_configured_tournaments(upstream, capsys):
    assert await script.run(script.parse_args(["--tournament-id", "60214"])) == 1

    assert "Not in CRICHEROES_SYNC_TOURNAMENT_IDS: [60214]" in capsys.readouterr().out
    assert await CricHeroesCallCount.find_all().count() == 0
