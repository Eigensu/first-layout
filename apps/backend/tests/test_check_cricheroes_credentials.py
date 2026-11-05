"""scripts/check_cricheroes_credentials.py: when it may say the credentials work.

The API doc does not say how CricHeroes rejects credentials. A 401/403 is the
obvious way, but a 200 carrying status:false is another, so only the one
refusal that proves the request got through -- "no boundary data for this
tournament" -- counts as success.
"""

import httpx
import pytest
import pytest_asyncio
from cricheroes_responses import refusal

import scripts.check_cricheroes_credentials as check_script
from app.services.cricheroes_client import CricHeroesClient

CREDS = {"api_key": "k", "secret_access_key": "s", "udid": "u"}


@pytest_asyncio.fixture
async def answer(monkeypatch):
    """Make the script's client get `response` from CricHeroes."""
    opened = []

    def _answer(response: httpx.Response):
        http = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: response))
        opened.append(http)

        def client(**kwargs):
            return CricHeroesClient(
                **CREDS,
                base_url="https://cricheroes.test/api/v1",
                client=http,
                **kwargs,
            )

        monkeypatch.setattr(check_script, "CricHeroesClient", client)

    yield _answer
    for http in opened:
        await http.aclose()


async def test_data_means_the_credentials_work(answer, capsys):
    answer(httpx.Response(200, json={"status": True, "data": [{"total_six": 1}]}))

    assert await check_script.check(2242502) == 0
    assert "OK: credentials accepted" in capsys.readouterr().out


@pytest.mark.parametrize("code", [170008, "170008"])
async def test_no_boundary_data_means_the_credentials_work(answer, capsys, code):
    answer(refusal(code, "nope"))

    assert await check_script.check(2242502) == 0
    assert "OK: credentials accepted" in capsys.readouterr().out


@pytest.mark.parametrize("code", [170003, 1, None])
async def test_any_other_refusal_is_not_success(answer, capsys, code):
    answer(refusal(code, "nope"))

    assert await check_script.check(2242502) == 1
    out = capsys.readouterr().out
    assert "OK" not in out
    assert "do not treat them as working" in out


async def test_a_tournament_outside_our_agreement_proves_nothing(answer, capsys):
    answer(refusal(170001, "Access to this tournament is not allowed.", status=403))

    assert await check_script.check(60214) == 1
    out = capsys.readouterr().out
    assert "OK" not in out
    assert "CricHeroesAccessError" in out
    assert "try --tournament-id 2242502 or 2251924." in out


async def test_a_refused_default_suggests_only_the_other_served_id(answer, capsys):
    answer(refusal(170001, "Access to this tournament is not allowed.", status=403))

    assert await check_script.check(2242502) == 1
    out = capsys.readouterr().out
    assert "try --tournament-id 2251924." in out
    assert "--tournament-id 2242502" not in out


async def test_a_rejection_is_failure(answer, capsys):
    answer(httpx.Response(401))

    assert await check_script.check(2242502) == 1
    assert "CricHeroesAuthError" in capsys.readouterr().out
