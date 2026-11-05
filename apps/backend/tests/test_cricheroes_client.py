"""CricHeroesClient against a scripted upstream (httpx.MockTransport).

No network. Response bodies come from the API doc's own examples, kept in
tests/fixtures/cricheroes_doc_examples.json; the few hand-made bodies are for
cases the doc does not show (errors, drift from the documented types).
"""

import asyncio
import copy
import json
import logging
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from cricheroes_responses import refusal
from pydantic import BaseModel

from app.schemas.cricheroes import BattingLeaderboardEntry
from app.services.cricheroes_client import DEVICE_TYPE, USER_AGENT, CricHeroesClient
from app.services.cricheroes_errors import (
    CricHeroesAccessError,
    CricHeroesAPIError,
    CricHeroesAuthError,
    CricHeroesBlockedError,
    CricHeroesConfigError,
    CricHeroesHTTPError,
    CricHeroesRateLimitError,
    CricHeroesSchemaError,
    CricHeroesTransportError,
)

BASE = "https://cricheroes.test/api/v1"
CREDS = {
    "api_key": "test-api-key",
    "secret_access_key": "test-secret-access-key",
    "udid": "test-udid",
}

DOC = json.loads(
    (Path(__file__).parent / "fixtures" / "cricheroes_doc_examples.json").read_text()
)


def doc(endpoint: str):
    """The `data` of the doc's example response for one endpoint."""
    return DOC[endpoint]["data"]


def ok(data) -> httpx.Response:
    return httpx.Response(200, json={"status": True, "data": data})


def throttled(retry_after=None) -> httpx.Response:
    headers = {"Retry-After": str(retry_after)} if retry_after is not None else {}
    return httpx.Response(429, headers=headers, text="Too Many Requests")


class Upstream:
    """A scripted CricHeroes: answers each request with the next scripted
    response, repeating the last one once the script runs out."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        response = (
            self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        )
        if isinstance(response, Exception):
            raise response
        return response


@pytest_asyncio.fixture
async def make_client():
    """Build a client over a scripted upstream. Returns (client, sleeps), where
    sleeps records every backoff the client asked for instead of waiting."""
    opened = []

    def _make(upstream: Upstream, **overrides):
        http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        opened.append(http)
        sleeps: list[float] = []

        async def fake_sleep(seconds: float) -> None:
            sleeps.append(seconds)

        options = {**CREDS, "base_url": BASE, "timeout": 15.0, "max_retries": 2}
        options.update(overrides)
        return CricHeroesClient(client=http, sleep=fake_sleep, **options), sleeps

    yield _make
    for http in opened:
        await http.aclose()


# -- headers, credentials, URLs --------------------------------------------


async def test_sends_the_five_documented_headers(make_client):
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream)

    await client.get_tournament_match_list(2242502)

    headers = upstream.requests[0].headers
    assert headers["content-type"] == "application/json"
    assert headers["api-key"] == CREDS["api_key"]
    assert headers["secret_access_key"] == CREDS["secret_access_key"]
    assert headers["udid"] == CREDS["udid"]
    assert headers["device-type"] == DEVICE_TYPE == "thirdparty-media-hubble"


async def test_names_us_in_the_user_agent_not_httpx(make_client):
    """CricHeroes' firewall blocks httpx's default User-Agent (code 20250529)."""
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream)

    await client.get_tournament_match_list(2242502)

    user_agent = upstream.requests[0].headers["user-agent"]
    assert user_agent == USER_AGENT
    assert user_agent.startswith("WalleArena/")
    assert "httpx" not in user_agent.lower()


async def test_requests_go_under_the_mediahubble_path(make_client):
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream)

    await client.get_tournament_point_table(2242502)

    assert str(upstream.requests[0].url) == (
        f"{BASE}/thirdparty/mediahubble/get-tournament-point-table/2242502"
    )


async def test_missing_credentials_raise_before_any_request(make_client):
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream, api_key="", secret_access_key="", udid="")

    with pytest.raises(CricHeroesConfigError) as caught:
        await client.get_tournament_match_list(2242502)

    assert caught.value.missing == [
        "CRICHEROES_API_KEY",
        "CRICHEROES_SECRET_ACCESS_KEY",
        "CRICHEROES_UDID",
    ]
    assert upstream.requests == []


async def test_partial_credentials_name_only_what_is_missing(make_client):
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream, udid="")

    with pytest.raises(CricHeroesConfigError) as caught:
        await client.get_tournament_match_list(2242502)

    assert caught.value.missing == ["CRICHEROES_UDID"]
    assert "CRICHEROES_API_KEY" not in str(caught.value)
    assert upstream.requests == []


async def test_credentials_never_reach_the_logs(make_client, caplog):
    upstream = Upstream(throttled(), ok([]))
    client, _ = make_client(upstream)

    with caplog.at_level(logging.DEBUG, logger="app.cricheroes"):
        await client.get_tournament_match_list(2242502, team_id=7)

    assert "get-tournament-match-list" in caplog.text
    for secret in CREDS.values():
        assert secret not in caplog.text


# -- error mapping ---------------------------------------------------------


@pytest.mark.parametrize("status", [401, 403])
async def test_rejected_credentials_raise_auth_error_naming_the_env_vars(
    make_client, status
):
    client, _ = make_client(Upstream(httpx.Response(status, text="nope")))

    with pytest.raises(CricHeroesAuthError) as caught:
        await client.get_tournament_match_list(2242502)

    assert caught.value.status_code == status
    message = str(caught.value)
    for name in (
        "CRICHEROES_API_KEY",
        "CRICHEROES_SECRET_ACCESS_KEY",
        "CRICHEROES_UDID",
    ):
        assert name in message
    assert "examples" in message and "placeholder" in message


@pytest.mark.parametrize("code", [170001, "170001"])
async def test_a_tournament_outside_our_agreement_is_not_a_credentials_error(
    make_client, code
):
    client, _ = make_client(
        Upstream(refusal(code, "Access to this tournament is not allowed.", status=403))
    )

    with pytest.raises(CricHeroesAccessError) as caught:
        await client.get_tournament_match_list(60214)

    assert not isinstance(caught.value, CricHeroesAuthError)
    # Still an API error, so callers that handle "no such data" handle it too.
    assert isinstance(caught.value, CricHeroesAPIError)
    assert caught.value.code == code
    message = str(caught.value)
    assert "do not give us access" in message
    assert "Access to this tournament is not allowed." in message
    assert "CRICHEROES_API_KEY" not in message


async def test_a_tournament_refused_with_a_200_is_still_an_access_error(make_client):
    """Their 96xxx refusals all came as 200s. Whichever status 170001 arrives
    with, it is the agreement's limit, not "no such data"."""
    client, _ = make_client(
        Upstream(refusal(170001, "Access to this tournament is not allowed."))
    )

    with pytest.raises(CricHeroesAccessError):
        await client.get_tournament_match_list(60214)


async def test_a_missing_match_answered_with_403_is_an_api_error(make_client):
    client, _ = make_client(
        Upstream(refusal(170002, "Match is not found!", status=403))
    )

    with pytest.raises(CricHeroesAPIError) as caught:
        await client.get_match_playing_squad(1)

    assert type(caught.value) is CricHeroesAPIError
    assert caught.value.code == 170002


@pytest.mark.parametrize(
    "response",
    [
        refusal(170099, "Invalid credentials", status=403),
        refusal(170001, "Access to this tournament is not allowed.", status=401),
        httpx.Response(403, json={"status": False, "error": "Forbidden"}),
        httpx.Response(403, json=["not", "an", "envelope"]),
    ],
    ids=["other-code", "401", "error-not-an-object", "not-an-object"],
)
async def test_any_other_refusal_is_still_a_credentials_error(make_client, response):
    client, _ = make_client(Upstream(response))

    with pytest.raises(CricHeroesAuthError):
        await client.get_tournament_match_list(2242502)


# Both bodies as CricHeroes sent them on 6 Nov 2026, to a request with dummy
# credentials: the firewall's, for httpx's default User-Agent, and the API's,
# once a request got past it.
FIREWALL_BLOCK = httpx.Response(
    403,
    json={
        "status": False,
        "error": {
            "code": 20250529,
            "message": "Request blocked by security policy. (err: 20250529)",
        },
    },
)
INVALID_API_KEY = refusal(2002, "Invalid api-key")


async def test_a_firewall_block_is_not_a_credentials_error(make_client):
    """The 403 that sent us checking keys that were never the problem."""
    client, _ = make_client(Upstream(FIREWALL_BLOCK))

    with pytest.raises(CricHeroesBlockedError) as caught:
        await client.get_tournament_match_list(2242502)

    assert not isinstance(caught.value, CricHeroesAuthError)
    assert not isinstance(caught.value, CricHeroesAPIError)
    assert caught.value.status_code == 403
    assert caught.value.code == 20250529
    message = str(caught.value)
    assert "firewall" in message
    assert "not the problem" in message
    assert "Request blocked by security policy" in message
    assert "CRICHEROES_API_KEY" not in message


@pytest.mark.parametrize(
    "response",
    [
        refusal("20250529", "nope", status=403),
        refusal(None, "Request blocked by security policy.", status=403),
        refusal(20250529, "Request blocked by security policy.", status=200),
    ],
    ids=["code-as-string", "message-only", "on-a-200"],
)
async def test_a_firewall_block_is_known_by_its_code_or_message(make_client, response):
    client, _ = make_client(Upstream(response))

    with pytest.raises(CricHeroesBlockedError):
        await client.get_tournament_match_list(2242502)


@pytest.mark.parametrize(
    "response",
    [
        INVALID_API_KEY,
        refusal("2002", "Invalid api-key", status=403),
        refusal(2099, "Invalid udid"),
        refusal(2098, "invalid secret_access_key"),
    ],
    ids=["2002-on-a-200", "2002-on-a-403", "udid-by-message", "secret-by-message"],
)
async def test_a_credentials_refusal_in_the_body_is_a_credentials_error(
    make_client, response
):
    """A wrong api-key comes back as a 200 with status:false, not a 401/403.
    Read as "no such data" it would have looked like a bad tournament id."""
    client, _ = make_client(Upstream(response))

    with pytest.raises(CricHeroesAuthError) as caught:
        await client.get_tournament_match_list(2242502)

    assert caught.value.status_code == response.status_code
    message = str(caught.value)
    assert "CRICHEROES_API_KEY" in message
    assert "CricHeroes said: code" in message


@pytest.mark.parametrize("status", [200, 403])
@pytest.mark.parametrize(
    "message", [42, ["a", "list"], {"an": "object"}], ids=["number", "list", "dict"]
)
async def test_a_message_that_is_not_a_string_does_not_crash_the_checks(
    make_client, status, message
):
    client, _ = make_client(Upstream(refusal(170099, message, status=status)))

    with pytest.raises((CricHeroesAuthError, CricHeroesAPIError)) as caught:
        await client.get_tournament_match_list(2242502)

    assert str(message) in str(caught.value)


@pytest.mark.parametrize("status", [400, 503])
async def test_a_firewall_block_with_another_status_is_still_one(make_client, status):
    client, _ = make_client(
        Upstream(
            refusal(20250529, "Request blocked by security policy.", status=status)
        )
    )

    with pytest.raises(CricHeroesBlockedError) as caught:
        await client.get_tournament_match_list(2242502)

    assert caught.value.status_code == status


@pytest.mark.parametrize("status", [400, 503])
async def test_a_credentials_refusal_with_another_status_is_still_one(
    make_client, status
):
    client, _ = make_client(Upstream(refusal(2002, "Invalid api-key", status=status)))

    with pytest.raises(CricHeroesAuthError) as caught:
        await client.get_tournament_match_list(2242502)

    assert caught.value.status_code == status


async def test_an_error_status_with_an_unknown_code_is_still_an_http_error(
    make_client,
):
    client, _ = make_client(Upstream(refusal(170099, "boom", status=503)))

    with pytest.raises(CricHeroesHTTPError) as caught:
        await client.get_tournament_match_list(2242502)

    assert not isinstance(caught.value, CricHeroesAuthError)
    assert caught.value.status_code == 503


async def test_a_rejection_keeps_what_cricheroes_said(make_client):
    client, _ = make_client(
        Upstream(refusal(170099, "Invalid credentials", status=403))
    )

    with pytest.raises(CricHeroesAuthError) as caught:
        await client.get_tournament_match_list(2242502)

    assert caught.value.code == 170099
    assert "code 170099: Invalid credentials" in str(caught.value)


async def test_a_rejection_without_a_body_says_nothing_it_was_not_told(make_client):
    client, _ = make_client(Upstream(httpx.Response(403, text="nope")))

    with pytest.raises(CricHeroesAuthError) as caught:
        await client.get_tournament_match_list(2242502)

    assert caught.value.code is None
    assert "CricHeroes said" not in str(caught.value)


ERRORS = [
    (endpoint, status, body)
    for endpoint, examples in DOC["_errors"].items()
    for status, body in examples
]


@pytest.mark.parametrize(
    "endpoint, status, body",
    ERRORS,
    ids=[f"{e}-{b['error']['code']}" for e, _, b in ERRORS],
)
async def test_every_documented_error_is_reported_as_what_it_is(
    make_client, endpoint, status, body
):
    """170001 is our agreement's limit, every other documented code is "no
    such data", and none of them is a credentials problem."""
    method, args, _ = next((m, a, p) for e, m, a, p in CALLS if e == endpoint)
    client, _ = make_client(Upstream(httpx.Response(status, json=body)))

    with pytest.raises(CricHeroesAPIError) as caught:
        await getattr(client, method)(*args)

    assert caught.value.code == body["error"]["code"]
    assert isinstance(caught.value, CricHeroesAccessError) == (
        body["error"]["code"] == 170001
    )


async def test_server_error_is_http_error_not_auth(make_client):
    client, _ = make_client(Upstream(httpx.Response(500, text="boom")))

    with pytest.raises(CricHeroesHTTPError) as caught:
        await client.get_tournament_match_list(2242502)

    assert not isinstance(caught.value, CricHeroesAuthError)
    assert caught.value.status_code == 500
    assert "boom" in caught.value.body


async def test_status_false_raises_api_error_with_upstream_code(make_client):
    body = {
        "status": False,
        "error": {"code": 170011, "message": "Tournament match list is not found!"},
    }
    client, _ = make_client(Upstream(httpx.Response(200, json=body)))

    with pytest.raises(CricHeroesAPIError) as caught:
        await client.get_tournament_match_list(2242502)

    assert caught.value.code == 170011
    assert caught.value.message == "Tournament match list is not found!"


@pytest.mark.parametrize(
    "failure",
    [httpx.ConnectError("refused"), httpx.ReadTimeout("slow")],
    ids=["connect", "timeout"],
)
async def test_no_answer_is_transport_error(make_client, failure):
    client, _ = make_client(Upstream(failure))

    with pytest.raises(CricHeroesTransportError):
        await client.get_tournament_match_list(2242502)


async def test_a_non_dict_error_is_still_an_api_error(make_client):
    """The doc's own error examples are not all well-formed JSON objects."""
    body = {"status": False, "error": "Tournament not found"}
    client, _ = make_client(Upstream(httpx.Response(200, json=body)))

    with pytest.raises(CricHeroesAPIError) as caught:
        await client.get_tournament_match_list(2242502)

    assert caught.value.code is None
    assert caught.value.message == "Tournament not found"


async def test_a_non_dict_credentials_error_is_still_a_credentials_error(
    make_client,
):
    body = {"status": False, "error": "Invalid api key"}
    client, _ = make_client(Upstream(httpx.Response(200, json=body)))

    with pytest.raises(CricHeroesAuthError) as caught:
        await client.get_tournament_match_list(2242502)

    assert "CricHeroes said: Invalid api key." in str(caught.value)


async def test_a_slow_trickle_hits_the_overall_deadline(make_client):
    """httpx times out each phase separately; the client's deadline is for
    the whole request."""

    async def slow(request):
        await asyncio.sleep(1)
        return ok([])

    client, _ = make_client(slow, timeout=0.05)

    with pytest.raises(CricHeroesTransportError) as caught:
        await client.get_tournament_match_list(2242502)

    assert "took longer than 0.05s" in str(caught.value)


async def test_non_json_body_is_http_error(make_client):
    client, _ = make_client(
        Upstream(httpx.Response(200, text="<html>maintenance</html>"))
    )

    with pytest.raises(CricHeroesHTTPError) as caught:
        await client.get_tournament_match_list(2242502)

    assert "non-JSON" in str(caught.value)


# -- retries (spec §6.5) ---------------------------------------------------


async def test_a_429_then_success_retries_once(make_client):
    upstream = Upstream(throttled(), ok([]))
    client, sleeps = make_client(upstream)

    assert await client.get_tournament_match_list(2242502) == []
    assert len(upstream.requests) == 2
    assert len(sleeps) == 1


async def test_429_throughout_gives_up_after_max_retries(make_client):
    upstream = Upstream(throttled())
    client, sleeps = make_client(upstream, max_retries=2)

    with pytest.raises(CricHeroesRateLimitError) as caught:
        await client.get_tournament_match_list(2242502)

    assert len(upstream.requests) == 3
    # Exponential with +/-20% jitter around 0.5s then 1.5s.
    assert len(sleeps) == 2
    assert 0.4 <= sleeps[0] <= 0.6
    assert 1.2 <= sleeps[1] <= 1.8
    assert caught.value.retry_after is None
    assert "quota" in str(caught.value)


async def test_max_retries_zero_raises_on_the_first_429(make_client):
    upstream = Upstream(throttled())
    client, sleeps = make_client(upstream, max_retries=0)

    with pytest.raises(CricHeroesRateLimitError):
        await client.get_tournament_match_list(2242502)

    assert len(upstream.requests) == 1
    assert sleeps == []


@pytest.mark.parametrize("status", [500, 502, 503])
async def test_server_errors_are_not_retried(make_client, status):
    upstream = Upstream(httpx.Response(status, text="down"))
    client, sleeps = make_client(upstream)

    with pytest.raises(CricHeroesHTTPError):
        await client.get_tournament_match_list(2242502)

    assert len(upstream.requests) == 1
    assert sleeps == []


async def test_transport_errors_are_not_retried(make_client):
    upstream = Upstream(httpx.ConnectError("refused"))
    client, sleeps = make_client(upstream)

    with pytest.raises(CricHeroesTransportError):
        await client.get_tournament_match_list(2242502)

    assert len(upstream.requests) == 1
    assert sleeps == []


async def test_retry_after_is_honoured(make_client):
    upstream = Upstream(throttled(retry_after=2), ok([]))
    client, sleeps = make_client(upstream)

    await client.get_tournament_match_list(2242502)

    assert sleeps == [2.0]


async def test_retry_after_beyond_the_budget_gives_up_without_retrying(make_client):
    # Waiting less than asked would only earn a second 429, and maybe a second
    # charge against the quota, so the client stops and passes the wait on.
    upstream = Upstream(throttled(retry_after=60), ok([]))
    client, sleeps = make_client(upstream, timeout=15.0)

    with pytest.raises(CricHeroesRateLimitError) as caught:
        await client.get_tournament_match_list(2242502)

    assert len(upstream.requests) == 1
    assert sleeps == []
    assert caught.value.retry_after == 60.0


async def test_total_waiting_stays_within_the_timeout_budget(make_client):
    upstream = Upstream(throttled(retry_after=8))
    client, sleeps = make_client(upstream, timeout=15.0, max_retries=5)

    with pytest.raises(CricHeroesRateLimitError):
        await client.get_tournament_match_list(2242502)

    # 8s fits in 15s once; a second 8s would not.
    assert sleeps == [8.0]
    assert sum(sleeps) <= 15.0


async def test_unparseable_retry_after_falls_back_to_backoff(make_client):
    upstream = Upstream(
        httpx.Response(429, headers={"Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT"}),
        ok([]),
    )
    client, sleeps = make_client(upstream)

    await client.get_tournament_match_list(2242502)

    assert len(sleeps) == 1 and 0.4 <= sleeps[0] <= 0.6


@pytest.mark.parametrize("value", ["inf", "nan", "1e999", "-5"])
async def test_a_retry_after_nobody_can_honour_falls_back_to_backoff(
    make_client, value
):
    upstream = Upstream(throttled(retry_after=value), ok([]))
    client, sleeps = make_client(upstream)

    await client.get_tournament_match_list(2242502)

    assert len(sleeps) == 1 and 0.4 <= sleeps[0] <= 0.6


# -- every documented endpoint, against its documented example --------------

# (doc example, client method, arguments, the upstream path it must call)
CALLS = [
    (
        "get-match-playing-squad",
        "get_match_playing_squad",
        (458328,),
        "get-match-playing-squad/458328",
    ),
    (
        "get-match-current-partnership",
        "get_match_current_partnership",
        (455172,),
        "get-match-current-partnership/455172",
    ),
    (
        "get-match-partnership",
        "get_match_partnership",
        (458328, 362525),
        "get-match-partnership/458328/362525",
    ),
    (
        "get-match-manhattan-graph",
        "get_match_manhattan_graph",
        (458328,),
        "get-match-manhattan-graph/458328",
    ),
    (
        "get-match-worm-graph",
        "get_match_worm_graph",
        (458328,),
        "get-match-worm-graph/458328",
    ),
    (
        "get-tournament-boundary-count",
        "get_tournament_boundary_count",
        (2242502,),
        "get-tournament-boundary-count/2242502",
    ),
    (
        "get-player-tournament-match-batting-data",
        "get_player_tournament_match_batting_data",
        (2242502, 2826925),
        "get-player-tournament-match-batting-data/2242502/2826925",
    ),
    (
        "get-player-tournament-match-bowling-data",
        "get_player_tournament_match_bowling_data",
        (2242502, 2826556),
        "get-player-tournament-match-bowling-data/2242502/2826556",
    ),
    (
        "get-tournament-match-list",
        "get_tournament_match_list",
        (2242502,),
        "get-tournament-match-list/2242502",
    ),
    (
        "get-tournament-point-table",
        "get_tournament_point_table",
        (2242502,),
        "get-tournament-point-table/2242502",
    ),
    (
        "get-tournament-batting-leaderboard",
        "get_tournament_batting_leaderboard",
        (2242502,),
        "get-tournament-batting-leaderboard/2242502",
    ),
    (
        "get-tournament-inning-batting-leaderboard",
        "get_tournament_inning_batting_leaderboard",
        (2242502,),
        "get-tournament-inning-batting-leaderboard/2242502",
    ),
    (
        "get-tournament-bowling-leaderboard",
        "get_tournament_bowling_leaderboard",
        (2242502,),
        "get-tournament-bowling-leaderboard/2242502",
    ),
    (
        "get-tournament-inning-bowling-leaderboard",
        "get_tournament_inning_bowling_leaderboard",
        (2242502,),
        "get-tournament-inning-bowling-leaderboard/2242502",
    ),
    (
        "get-tournament-stat-leaderboard-filter",
        "get_tournament_leaderboard_stats_filter",
        (2242502,),
        "get-tournament-stat-leaderboard-filter/2242502",
    ),
    (
        "get-match-player-mvp",
        "get_match_player_mvp",
        (458328,),
        "get-match-player-mvp/458328",
    ),
    (
        "get-tournament-player-mvp",
        "get_tournament_player_mvp",
        (2242502,),
        "get-tournament-player-mvp/2242502",
    ),
    (
        "get-player-batting-season-data",
        "get_player_batting_season_data",
        (22319789,),
        "get-player-batting-season-data/22319789",
    ),
    (
        "get-player-bowling-season-data",
        "get_player_bowling_season_data",
        (22319789,),
        "get-player-bowling-season-data/22319789",
    ),
]


def leftovers(value, path: str = "data") -> list[str]:
    """Every key in a parsed result that no model declares, by path."""
    found = []
    if isinstance(value, BaseModel):
        found += [f"{path}.{key}" for key in (value.model_extra or {})]
        for name in type(value).model_fields:
            found += leftovers(getattr(value, name), f"{path}.{name}")
    elif isinstance(value, list):
        for i, item in enumerate(value):
            found += leftovers(item, f"{path}[{i}]")
    return found


def test_every_documented_endpoint_has_a_call_and_an_example():
    assert {c[0] for c in CALLS} == {k for k in DOC if not k.startswith("_")}
    assert len(CALLS) == 19


@pytest.mark.parametrize(
    "endpoint, method, args, path", CALLS, ids=[c[0] for c in CALLS]
)
async def test_the_documented_example_parses_with_nothing_left_over(
    make_client, endpoint, method, args, path
):
    """Every field in the doc's example is modelled, at every depth. A field
    that comes back as an extra here is one the model is missing."""
    upstream = Upstream(httpx.Response(200, json=DOC[endpoint]))
    client, _ = make_client(upstream)

    result = await getattr(client, method)(*args)

    assert upstream.requests[0].url.path == f"/api/v1/thirdparty/mediahubble/{path}"
    assert result, "the example parsed to nothing"
    assert leftovers(result) == []


# -- params ----------------------------------------------------------------


async def test_unset_params_are_omitted_not_sent_empty(make_client):
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream)

    await client.get_tournament_match_list(2242502)

    assert upstream.requests[0].url.query == b""


async def test_params_use_the_upstream_spellings(make_client):
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream)

    await client.get_tournament_match_list(1, match_type=3, team_id=7, order="DESC")
    await client.get_tournament_point_table(1, round_id=4, group_id=5)
    await client.get_tournament_batting_leaderboard(1, sort_filter="RUN")
    await client.get_match_playing_squad(1, team_id=362504)

    params = [dict(r.url.params) for r in upstream.requests]
    assert params[0] == {"type": "3", "teamId": "7", "order": "DESC"}
    assert params[1] == {"roundId": "4", "groupId": "5"}
    assert params[2] == {"sort_filter": "RUN"}
    assert params[3] == {"teamId": "362504"}


# -- shapes ----------------------------------------------------------------


async def test_current_partnership_is_one_object_and_partnership_a_list(make_client):
    upstream = Upstream(
        ok(doc("get-match-current-partnership")), ok(doc("get-match-partnership"))
    )
    client, _ = make_client(upstream)

    current = await client.get_match_current_partnership(455172)
    every = await client.get_match_partnership(458328, 362525)

    assert current.player_a_name == "Mark Wood"
    # Only the per-team list carries to_over, as a string.
    assert current.to_over is None
    assert [p.to_over for p in every] == ["5.4", "16.3", "49.5", "50"]
    assert every[0].from_over == 0.0


async def test_an_unbroken_stand_ends_at_a_dash(make_client):
    # Shown by the doc of 30 May 2025, not by the current one.
    row = dict(doc("get-match-partnership")[-1], to_over="-")
    client, _ = make_client(Upstream(ok([row])))

    [stand] = await client.get_match_partnership(458328, 362504)

    assert stand.to_over == "-"


async def test_boundary_count_one_element_list_is_unwrapped(make_client):
    client, _ = make_client(Upstream(ok(doc("get-tournament-boundary-count"))))

    result = await client.get_tournament_boundary_count(2242502)

    assert (result.total_six, result.total_four) == (291, 1571)


async def test_list_endpoint_answering_an_object_raises_schema_error(make_client):
    client, _ = make_client(Upstream(ok({"rows": []})))

    with pytest.raises(CricHeroesSchemaError) as caught:
        await client.get_tournament_match_list(2242502)

    # A subclass, so routes map it to 502 with the other upstream failures.
    assert isinstance(caught.value, CricHeroesHTTPError)
    assert "get-tournament-match-list" in str(caught.value)
    assert "expected a list" in str(caught.value)


async def test_a_field_that_does_not_fit_raises_schema_error(make_client):
    body = dict(
        doc("get-tournament-stat-leaderboard-filter"),
        teams=[{"team_id": "not-a-number", "team_name": "X"}],
    )
    client, _ = make_client(Upstream(ok(body)))

    with pytest.raises(CricHeroesSchemaError) as caught:
        await client.get_tournament_leaderboard_stats_filter(2242502)

    assert "get-tournament-stat-leaderboard-filter" in str(caught.value)
    assert "team_id" in str(caught.value)


async def test_a_row_missing_its_identity_raises_schema_error(make_client):
    row = {k: v for k, v in doc("get-tournament-batting-leaderboard")[0].items()}
    del row["player_id"]
    client, _ = make_client(Upstream(ok([row])))

    with pytest.raises(CricHeroesSchemaError) as caught:
        await client.get_tournament_batting_leaderboard(2242502)

    assert "player_id" in str(caught.value)


async def test_an_empty_data_list_is_an_empty_result(make_client):
    client, _ = make_client(Upstream(ok(None)))

    assert await client.get_tournament_match_list(2242502) == []


# -- type traps (spec §8.2), from the doc's own values ---------------------


async def test_batting_leaderboard_keeps_its_strings(make_client):
    client, _ = make_client(Upstream(ok(doc("get-tournament-batting-leaderboard"))))

    rohit, shakib = await client.get_tournament_batting_leaderboard(2242502)

    assert (rohit.fours, rohit.sixes, rohit.fifties, rohit.hundreds) == (67, 14, 1, 5)
    assert rohit.strike_rate == "98.33"
    assert rohit.average == "81.00"
    # A marker string, not a bool.
    assert rohit.highest_run_with_not_out == ""
    assert shakib.highest_run_with_not_out == "*"


async def test_inning_batting_strike_rate_is_a_float(make_client):
    client, _ = make_client(
        Upstream(ok(doc("get-tournament-inning-batting-leaderboard")))
    )

    warner, _ = await client.get_tournament_inning_batting_leaderboard(2242502)

    # Passed on as sent, single-precision noise included.
    assert warner.strike_rate == 112.92500305175781
    assert (warner.fours, warner.sixes) == (14, 5)
    assert warner.against_team_name == "Bangladesh (WC19)"


async def test_bowling_leaderboard_is_mostly_strings(make_client):
    client, _ = make_client(Upstream(ok(doc("get-tournament-bowling-leaderboard"))))

    starc, _ = await client.get_tournament_bowling_leaderboard(2242502)

    assert (starc.balls, starc.overs, starc.economy) == ("554", "92.2", "5.45")
    assert starc.strike_rate == "20.52"
    # ...except the average.
    assert starc.average == 18.63
    assert (starc.three_wickets, starc.four_wickets, starc.five_wickets) == (0, 2, 2)


async def test_inning_bowling_overs_and_economy_are_numbers(make_client):
    client, _ = make_client(
        Upstream(ok(doc("get-tournament-inning-bowling-leaderboard")))
    )

    shaheen, amir = await client.get_tournament_inning_bowling_leaderboard(2242502)

    assert (shaheen.overs, shaheen.economy) == (9.1, 3.82)
    assert (amir.overs, amir.economy) == (10.0, 3.0)
    assert shaheen.balls == "55"
    assert shaheen.best_bowling_figure == "6-35"
    assert shaheen.dot_ball == 34


async def test_a_number_where_the_doc_shows_a_string_stays_a_string(make_client):
    row = dict(doc("get-tournament-bowling-leaderboard")[0], overs=92, SR=20.5)
    client, _ = make_client(Upstream(ok([row])))

    [starc] = await client.get_tournament_bowling_leaderboard(2242502)

    assert (starc.overs, starc.strike_rate) == ("92", "20.5")


async def test_point_table_aliases(make_client):
    client, _ = make_client(Upstream(ok(doc("get-tournament-point-table"))))

    # The doc lists every team twice; the exact repeats are dropped (§8.2).
    australia, pakistan, india = await client.get_tournament_point_table(2242502)

    assert (australia.team_name, australia.team_id) == ("Australia (WC19)", 362535)
    assert australia.team_logo.endswith(".jpg")
    assert (australia.matches, australia.won, australia.lost) == (8, 7, 1)
    assert (australia.drawn, australia.tied, australia.no_result) == (0, 0, 0)
    assert (australia.points, australia.quotient) == (14, 0)
    assert australia.last_5 == "W-W-W-W-W-W-W-L"
    assert (australia.group, australia.group_id) == ("A", 32750)
    assert (australia.round_id, australia.round_name) == (98121, "League Matches")
    # Net RR is a string, or a bare 0 before any result counts.
    assert (pakistan.net_rr, india.net_rr) == ("-0.200", "0")


async def test_point_table_keeps_rows_that_differ_in_any_field(make_client):
    row = doc("get-tournament-point-table")[0]
    other_round = dict(row, RoundID=98122, RoundName="Semi-Finals")
    client, _ = make_client(Upstream(ok([row, row, other_round, row])))

    rows = await client.get_tournament_point_table(2242502)

    assert [r.round_id for r in rows] == [98121, 98122]


async def test_match_list(make_client):
    client, _ = make_client(Upstream(ok(doc("get-tournament-match-list"))))

    first, second = await client.get_tournament_match_list(2242502)

    assert first.winning_team_id == "362506"
    assert first.type == 3 and first.status == "past"
    assert first.city_name == "Manchester (England)"
    assert first.team_a_innings[0].revised_target == 0
    assert first.team_a_innings[0].summary.score == "325/6"
    assert first.match_summary.target == "-"
    assert first.query_id == second.query_id == "SS_DPvarSlM4erO5hV"


async def test_match_list_results_and_revisions(make_client):
    """The doc of 30 May 2025 showed an abandoned match, a no-result and a
    rain-revised chase; the current one shows only completed matches. The
    same values, on a current example row."""
    base = doc("get-tournament-match-list")[0]
    dls = copy.deepcopy(base)
    dls["team_a_innings"][0]["revised_target"] = 187
    dls["team_b_innings"][0]["revised_overs"] = 41
    abandoned = dict(
        base,
        match_result="abandoned",
        winning_team_id="",
        team_a_innings=[],
        team_a_summary="",
        team_b_innings=[],
        team_b_summary="",
    )
    no_result = dict(
        base, winning_team_id="0", team_b_innings=[], team_b_summary="Yet to bat"
    )
    client, _ = make_client(Upstream(ok([base, dls, abandoned, no_result])))

    won, dls, abandoned, no_result = await client.get_tournament_match_list(2242502)

    # winning_team_id is a string: a team id, "" when abandoned, "0" for N/R.
    assert won.winning_team_id == "362506"
    assert abandoned.winning_team_id == ""
    assert no_result.winning_team_id == "0"
    # Revisions are per innings; 0 means not revised.
    assert won.team_a_innings[0].revised_target == 0
    assert dls.team_a_innings[0].revised_target == 187
    assert dls.team_b_innings[0].revised_overs == 41
    # An abandoned match has no innings at all.
    assert abandoned.team_a_innings == [] and abandoned.team_a_summary == ""
    assert no_result.team_b_summary == "Yet to bat"


async def test_playing_squad(make_client):
    client, _ = make_client(Upstream(ok(doc("get-match-playing-squad"))))

    [england] = await client.get_match_playing_squad(458328, team_id=362504)

    morgan, archer, bairstow, buttler = england.match_squad
    assert (morgan.player_name, morgan.is_captain) == ("Eoin Morgan", 1)
    assert buttler.is_wicket_keeper == 1
    assert archer.bowling_type == "Right-arm medium"
    assert england.team_id == bairstow.team_id == 362504
    assert morgan.query_id == "SS_Jov0kr2YJ7bEMIV"


async def test_worm_overs_carry_a_running_total_and_manhattan_overs_do_not(
    make_client,
):
    client, _ = make_client(
        Upstream(ok(doc("get-match-manhattan-graph")), ok(doc("get-match-worm-graph")))
    )

    manhattan = await client.get_match_manhattan_graph(458328)
    worm = await client.get_match_worm_graph(458328)

    assert manhattan.match_info[0].current_inning == 2
    assert not hasattr(manhattan.graph_data[0], "total_score")
    assert (worm.graph_data[-1].total_score, worm.graph_data[-1].run_rate) == (
        8,
        "4.00",
    )


async def test_player_match_data(make_client):
    client, _ = make_client(
        Upstream(
            ok(doc("get-player-tournament-match-batting-data")),
            ok(doc("get-player-tournament-match-bowling-data")),
        )
    )

    batting = await client.get_player_tournament_match_batting_data(2242502, 2826555)
    bowling = await client.get_player_tournament_match_bowling_data(2242502, 2826687)

    assert batting.player_info.name == "Jason Roy"
    assert batting.player_info.dob == ""
    assert batting.player_data[0].is_not_out == 0
    # sr is a float, sent as 85 when whole.
    assert batting.player_data[-1].sr == 85.0
    # Overs are numbers here, unlike the tournament leaderboard's strings.
    assert [row.overs for row in bowling.player_data[2:4]] == [7.0, 10.0]
    # Each row now names its match, so a team met twice is two matches.
    assert [
        (row.match_id, row.match_date_time)
        for row in batting.player_data
        if row.opposition_team_name == "New Zealand (WC19)"
    ] == [
        (419814, "2019-07-03T04:00:00.000Z"),
        (458328, "2019-07-14T04:00:00.000Z"),
    ]
    assert bowling.player_data[0].match_id == 409537


async def test_batting_season_aliases_and_strings(make_client):
    client, _ = make_client(Upstream(ok(doc("get-player-batting-season-data"))))

    career, season = await client.get_player_batting_season_data(22319789)

    assert (career.year, season.year) == ("Career", "2023")
    assert (career.matches, career.not_outs, career.runs) == (4, 1, 168)
    assert (career.highest_score, career.average, career.strike_rate) == (
        "64",
        "56.00",
        "188.76",
    )
    assert career.balls_faced == 89
    assert (career.fours, career.sixes, career.fifties, career.hundreds) == (
        13,
        10,
        2,
        0,
    )


async def test_bowling_season_balls_is_int_on_career_and_str_on_seasons(make_client):
    client, _ = make_client(Upstream(ok(doc("get-player-bowling-season-data"))))

    career, season = await client.get_player_bowling_season_data(22319789)

    assert career.balls == 0
    assert season.balls == "0"
    # Placeholders are strings, and differ by row.
    assert (career.best_bowling, season.best_bowling) == ("", "-")
    assert (career.average, season.average) == ("-", "0.00")
    assert (career.economy, career.strike_rate) == ("0.00", "0.00")
    assert (career.four_wickets, career.five_wickets) == (0, 0)


async def test_stats_filter_parses_the_documented_shape(make_client):
    client, _ = make_client(Upstream(ok(doc("get-tournament-stat-leaderboard-filter"))))

    result = await client.get_tournament_leaderboard_stats_filter(2242502)

    assert [(s.key, s.value) for s in result.season] == [
        ("Tyrant Premier League Season 13", "2242502"),
        ("Tyrant Premier League Season 13 ( Test Format )", "2251924"),
        ("ALL", "-1"),
    ]
    orange = result.batting[0]
    assert (orange.key, orange.value) == ("Orange Cap", "RUN")
    assert orange.url == "thirdparty/mediahubble/get-tournament-batting-leaderboard"
    assert "MODB" in [option.value for option in result.bowling]
    assert {t.tournament_id for t in result.teams} == {2242502}
    assert result.teams[0].team_name == "Kolkata Tigers"


async def test_mvp_tables(make_client):
    client, _ = make_client(
        Upstream(ok(doc("get-match-player-mvp")), ok(doc("get-tournament-player-mvp")))
    )

    neesham, plunkett = await client.get_match_player_mvp(458328)
    shakib, warner = await client.get_tournament_player_mvp(2242502)

    assert (neesham.player_id, neesham.rank, neesham.matches) == (2826814, 1, 1)
    # Points are strings, and fielding is broken out.
    assert (neesham.batting, neesham.bowling, neesham.fielding, neesham.total) == (
        "1.900",
        "6.069",
        "0.750",
        "8.719",
    )
    assert plunkett.rank == 2
    assert (shakib.name, shakib.matches, shakib.total) == (
        "Shakib Al Hasan",
        7,
        "94.183",
    )
    assert warner.team_name == "Australia (WC19)"


async def test_unknown_fields_are_kept(make_client):
    row = dict(doc("get-tournament-batting-leaderboard")[0], brand_new_field="kept")
    client, _ = make_client(Upstream(ok([row])))

    [parsed] = await client.get_tournament_batting_leaderboard(2242502)

    assert parsed.model_extra == {"brand_new_field": "kept"}
    assert parsed.model_dump()["brand_new_field"] == "kept"


def test_models_accept_their_attribute_names_too():
    row = BattingLeaderboardEntry(player_id=1, name="X", fours=3)

    assert row.fours == 3
    assert row.model_dump(by_alias=True)["4s"] == 3


# -- lifecycle -------------------------------------------------------------


async def test_a_client_it_creates_is_closed_on_exit():
    async with CricHeroesClient(**CREDS, base_url=BASE) as client:
        http = client._get_client()
        assert not http.is_closed

    assert http.is_closed


async def test_an_injected_client_is_left_open():
    http = httpx.AsyncClient(transport=httpx.MockTransport(Upstream(ok([]))))
    try:
        async with CricHeroesClient(**CREDS, base_url=BASE, client=http):
            pass
        assert not http.is_closed
    finally:
        await http.aclose()
