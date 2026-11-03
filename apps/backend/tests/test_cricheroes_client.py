"""CricHeroesClient against a scripted upstream (httpx.MockTransport).

No network. Response bodies come from the API doc's own examples, kept in
tests/fixtures/cricheroes_doc_examples.json; the few hand-made bodies are for
cases the doc does not show (errors, drift from the documented types).
"""

import asyncio
import json
import logging
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from pydantic import BaseModel

from app.schemas.cricheroes import BattingLeaderboardEntry
from app.services.cricheroes_client import DEVICE_TYPE, CricHeroesClient
from app.services.cricheroes_errors import (
    CricHeroesAPIError,
    CricHeroesAuthError,
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

    await client.get_tournament_match_list(1493258)

    headers = upstream.requests[0].headers
    assert headers["content-type"] == "application/json"
    assert headers["api-key"] == CREDS["api_key"]
    assert headers["secret_access_key"] == CREDS["secret_access_key"]
    assert headers["udid"] == CREDS["udid"]
    assert headers["device-type"] == DEVICE_TYPE == "thirdparty-client"


async def test_requests_go_under_the_thirdparty_client_path(make_client):
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream)

    await client.get_tournament_point_table(1493258)

    assert str(upstream.requests[0].url) == (
        f"{BASE}/thirdparty/client/get-tournament-point-table/1493258"
    )


async def test_missing_credentials_raise_before_any_request(make_client):
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream, api_key="", secret_access_key="", udid="")

    with pytest.raises(CricHeroesConfigError) as caught:
        await client.get_tournament_match_list(1493258)

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
        await client.get_tournament_match_list(1493258)

    assert caught.value.missing == ["CRICHEROES_UDID"]
    assert "CRICHEROES_API_KEY" not in str(caught.value)
    assert upstream.requests == []


async def test_credentials_never_reach_the_logs(make_client, caplog):
    upstream = Upstream(throttled(), ok([]))
    client, _ = make_client(upstream)

    with caplog.at_level(logging.DEBUG, logger="app.cricheroes"):
        await client.get_tournament_match_list(1493258, team_id=7)

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
        await client.get_tournament_match_list(1493258)

    assert caught.value.status_code == status
    message = str(caught.value)
    for name in (
        "CRICHEROES_API_KEY",
        "CRICHEROES_SECRET_ACCESS_KEY",
        "CRICHEROES_UDID",
    ):
        assert name in message
    assert "examples" in message


async def test_server_error_is_http_error_not_auth(make_client):
    client, _ = make_client(Upstream(httpx.Response(500, text="boom")))

    with pytest.raises(CricHeroesHTTPError) as caught:
        await client.get_tournament_match_list(1493258)

    assert not isinstance(caught.value, CricHeroesAuthError)
    assert caught.value.status_code == 500
    assert "boom" in caught.value.body


async def test_status_false_raises_api_error_with_upstream_code(make_client):
    body = {"status": False, "error": {"code": 96003, "message": "No data found"}}
    client, _ = make_client(Upstream(httpx.Response(200, json=body)))

    with pytest.raises(CricHeroesAPIError) as caught:
        await client.get_tournament_match_list(1493258)

    assert caught.value.code == 96003
    assert caught.value.message == "No data found"


@pytest.mark.parametrize(
    "failure",
    [httpx.ConnectError("refused"), httpx.ReadTimeout("slow")],
    ids=["connect", "timeout"],
)
async def test_no_answer_is_transport_error(make_client, failure):
    client, _ = make_client(Upstream(failure))

    with pytest.raises(CricHeroesTransportError):
        await client.get_tournament_match_list(1493258)


async def test_a_non_dict_error_is_still_an_api_error(make_client):
    """The doc's own error examples are not all well-formed JSON objects."""
    body = {"status": False, "error": "Invalid api key"}
    client, _ = make_client(Upstream(httpx.Response(200, json=body)))

    with pytest.raises(CricHeroesAPIError) as caught:
        await client.get_tournament_match_list(1493258)

    assert caught.value.code is None
    assert caught.value.message == "Invalid api key"


async def test_a_slow_trickle_hits_the_overall_deadline(make_client):
    """httpx times out each phase separately; the client's deadline is for
    the whole request."""

    async def slow(request):
        await asyncio.sleep(1)
        return ok([])

    client, _ = make_client(slow, timeout=0.05)

    with pytest.raises(CricHeroesTransportError) as caught:
        await client.get_tournament_match_list(1493258)

    assert "took longer than 0.05s" in str(caught.value)


async def test_non_json_body_is_http_error(make_client):
    client, _ = make_client(
        Upstream(httpx.Response(200, text="<html>maintenance</html>"))
    )

    with pytest.raises(CricHeroesHTTPError) as caught:
        await client.get_tournament_match_list(1493258)

    assert "non-JSON" in str(caught.value)


# -- retries (spec §6.5) ---------------------------------------------------


async def test_a_429_then_success_retries_once(make_client):
    upstream = Upstream(throttled(), ok([]))
    client, sleeps = make_client(upstream)

    assert await client.get_tournament_match_list(1493258) == []
    assert len(upstream.requests) == 2
    assert len(sleeps) == 1


async def test_429_throughout_gives_up_after_max_retries(make_client):
    upstream = Upstream(throttled())
    client, sleeps = make_client(upstream, max_retries=2)

    with pytest.raises(CricHeroesRateLimitError) as caught:
        await client.get_tournament_match_list(1493258)

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
        await client.get_tournament_match_list(1493258)

    assert len(upstream.requests) == 1
    assert sleeps == []


@pytest.mark.parametrize("status", [500, 502, 503])
async def test_server_errors_are_not_retried(make_client, status):
    upstream = Upstream(httpx.Response(status, text="down"))
    client, sleeps = make_client(upstream)

    with pytest.raises(CricHeroesHTTPError):
        await client.get_tournament_match_list(1493258)

    assert len(upstream.requests) == 1
    assert sleeps == []


async def test_transport_errors_are_not_retried(make_client):
    upstream = Upstream(httpx.ConnectError("refused"))
    client, sleeps = make_client(upstream)

    with pytest.raises(CricHeroesTransportError):
        await client.get_tournament_match_list(1493258)

    assert len(upstream.requests) == 1
    assert sleeps == []


async def test_retry_after_is_honoured(make_client):
    upstream = Upstream(throttled(retry_after=2), ok([]))
    client, sleeps = make_client(upstream)

    await client.get_tournament_match_list(1493258)

    assert sleeps == [2.0]


async def test_retry_after_beyond_the_budget_gives_up_without_retrying(make_client):
    # Waiting less than asked would only earn a second 429, and maybe a second
    # charge against the quota, so the client stops and passes the wait on.
    upstream = Upstream(throttled(retry_after=60), ok([]))
    client, sleeps = make_client(upstream, timeout=15.0)

    with pytest.raises(CricHeroesRateLimitError) as caught:
        await client.get_tournament_match_list(1493258)

    assert len(upstream.requests) == 1
    assert sleeps == []
    assert caught.value.retry_after == 60.0


async def test_total_waiting_stays_within_the_timeout_budget(make_client):
    upstream = Upstream(throttled(retry_after=8))
    client, sleeps = make_client(upstream, timeout=15.0, max_retries=5)

    with pytest.raises(CricHeroesRateLimitError):
        await client.get_tournament_match_list(1493258)

    # 8s fits in 15s once; a second 8s would not.
    assert sleeps == [8.0]
    assert sum(sleeps) <= 15.0


async def test_unparseable_retry_after_falls_back_to_backoff(make_client):
    upstream = Upstream(
        httpx.Response(429, headers={"Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT"}),
        ok([]),
    )
    client, sleeps = make_client(upstream)

    await client.get_tournament_match_list(1493258)

    assert len(sleeps) == 1 and 0.4 <= sleeps[0] <= 0.6


@pytest.mark.parametrize("value", ["inf", "nan", "1e999", "-5"])
async def test_a_retry_after_nobody_can_honour_falls_back_to_backoff(
    make_client, value
):
    upstream = Upstream(throttled(retry_after=value), ok([]))
    client, sleeps = make_client(upstream)

    await client.get_tournament_match_list(1493258)

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
        "get-match-current-partnership/458328/362525",
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
        (1493258,),
        "get-tournament-boundary-count/1493258",
    ),
    (
        "get-player-tournament-match-batting-data",
        "get_player_tournament_match_batting_data",
        (1493258, 2826925),
        "get-player-tournament-match-batting-data/1493258/2826925",
    ),
    (
        "get-player-tournament-match-bowling-data",
        "get_player_tournament_match_bowling_data",
        (1493258, 2826556),
        "get-player-tournament-match-bowling-data/1493258/2826556",
    ),
    (
        "get-tournament-match-list",
        "get_tournament_match_list",
        (1493258,),
        "get-tournament-match-list/1493258",
    ),
    (
        "get-tournament-point-table",
        "get_tournament_point_table",
        (1493258,),
        "get-tournament-point-table/1493258",
    ),
    (
        "get-tournament-batting-leaderboard",
        "get_tournament_batting_leaderboard",
        (1493258,),
        "get-tournament-batting-leaderboard/1493258",
    ),
    (
        "get-tournament-inning-batting-leaderboard",
        "get_tournament_inning_batting_leaderboard",
        (1493258,),
        "get-tournament-inning-batting-leaderboard/1493258",
    ),
    (
        "get-tournament-bowling-leaderboard",
        "get_tournament_bowling_leaderboard",
        (1493258,),
        "get-tournament-bowling-leaderboard/1493258",
    ),
    (
        "get-tournament-inning-bowling-leaderboard",
        "get_tournament_inning_bowling_leaderboard",
        (1493258,),
        "get-tournament-inning-bowling-leaderboard/1493258",
    ),
    (
        "get-tournament-stat-leaderboard-filter",
        "get_tournament_leaderboard_stats_filter",
        (1493258,),
        "get-tournament-stat-leaderboard-filter/1493258",
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
    assert len(CALLS) == 17


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

    assert upstream.requests[0].url.path == f"/api/v1/thirdparty/client/{path}"
    assert result, "the example parsed to nothing"
    assert leftovers(result) == []


# -- params ----------------------------------------------------------------


async def test_unset_params_are_omitted_not_sent_empty(make_client):
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream)

    await client.get_tournament_match_list(1493258)

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

    assert current.player_a_name == "Eoin Morgan"
    # Only the per-team list carries to_over.
    assert current.to_over is None
    assert [p.to_over for p in every] == ["6.2", "39", "49.3", "-"]
    assert every[0].from_over == 0.0


async def test_boundary_count_one_element_list_is_unwrapped(make_client):
    client, _ = make_client(Upstream(ok(doc("get-tournament-boundary-count"))))

    result = await client.get_tournament_boundary_count(1493258)

    assert (result.total_six, result.total_four) == (357, 1982)


async def test_list_endpoint_answering_an_object_raises_schema_error(make_client):
    client, _ = make_client(Upstream(ok({"rows": []})))

    with pytest.raises(CricHeroesSchemaError) as caught:
        await client.get_tournament_match_list(1493258)

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
        await client.get_tournament_leaderboard_stats_filter(1493258)

    assert "get-tournament-stat-leaderboard-filter" in str(caught.value)
    assert "team_id" in str(caught.value)


async def test_a_row_missing_its_identity_raises_schema_error(make_client):
    row = {k: v for k, v in doc("get-tournament-batting-leaderboard")[0].items()}
    del row["player_id"]
    client, _ = make_client(Upstream(ok([row])))

    with pytest.raises(CricHeroesSchemaError) as caught:
        await client.get_tournament_batting_leaderboard(1493258)

    assert "player_id" in str(caught.value)


async def test_an_empty_data_list_is_an_empty_result(make_client):
    client, _ = make_client(Upstream(ok(None)))

    assert await client.get_tournament_match_list(1493258) == []


# -- type traps (spec §8.2), from the doc's own values ---------------------


async def test_batting_leaderboard_keeps_its_strings(make_client):
    client, _ = make_client(Upstream(ok(doc("get-tournament-batting-leaderboard"))))

    rohit, shakib = await client.get_tournament_batting_leaderboard(1493258)

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

    warner, _ = await client.get_tournament_inning_batting_leaderboard(1493258)

    # Passed on as sent, single-precision noise included.
    assert warner.strike_rate == 112.92500305175781
    assert (warner.fours, warner.sixes) == (14, 5)
    assert warner.against_team_name == "Bangladesh (WC19)"


async def test_bowling_leaderboard_is_mostly_strings(make_client):
    client, _ = make_client(Upstream(ok(doc("get-tournament-bowling-leaderboard"))))

    starc, _ = await client.get_tournament_bowling_leaderboard(1493258)

    assert (starc.balls, starc.overs, starc.economy) == ("554", "92.2", "5.45")
    assert starc.strike_rate == "20.52"
    # ...except the average.
    assert starc.average == 18.63
    assert (starc.three_wickets, starc.four_wickets, starc.five_wickets) == (0, 2, 2)


async def test_inning_bowling_overs_and_economy_are_numbers(make_client):
    client, _ = make_client(
        Upstream(ok(doc("get-tournament-inning-bowling-leaderboard")))
    )

    shaheen, amir = await client.get_tournament_inning_bowling_leaderboard(1493258)

    assert (shaheen.overs, shaheen.economy) == (9.1, 3.82)
    assert (amir.overs, amir.economy) == (10.0, 3.0)
    assert shaheen.balls == "55"
    assert shaheen.best_bowling_figure == "6-35"
    assert shaheen.dot_ball == 34


async def test_a_number_where_the_doc_shows_a_string_stays_a_string(make_client):
    row = dict(doc("get-tournament-bowling-leaderboard")[0], overs=92, SR=20.5)
    client, _ = make_client(Upstream(ok([row])))

    [starc] = await client.get_tournament_bowling_leaderboard(1493258)

    assert (starc.overs, starc.strike_rate) == ("92", "20.5")


async def test_point_table_aliases(make_client):
    client, _ = make_client(Upstream(ok(doc("get-tournament-point-table"))))

    england, south_africa = await client.get_tournament_point_table(1493258)

    assert england.team_name == "England (WC19)"
    assert (england.matches, england.won, england.lost) == (9, 6, 3)
    assert (england.drawn, england.tied, england.no_result) == (0, 0, 0)
    assert (england.points, england.quotient) == (12, 0)
    assert south_africa.net_rr == "-0.030"
    assert england.last_5 == "W-L-W-W-W-L-L-W-W"
    assert (england.group, england.group_id) == ("A", 32750)
    assert (england.round_id, england.round_name) == (98121, "League Matches")


async def test_match_list_results_and_revisions(make_client):
    client, _ = make_client(Upstream(ok(doc("get-tournament-match-list"))))

    won, dls, abandoned, no_result = await client.get_tournament_match_list(1493258)

    # winning_team_id is a string: a team id, "" when abandoned, "0" for N/R.
    assert won.winning_team_id == "362504"
    assert abandoned.winning_team_id == ""
    assert no_result.winning_team_id == "0"
    # Revisions are per innings; 0 means not revised.
    assert won.team_a_innings[0].revised_target == 0
    assert dls.team_a_innings[0].revised_target == 187
    assert dls.team_b_innings[0].revised_overs == 41
    # An abandoned match has no innings at all.
    assert abandoned.team_a_innings == [] and abandoned.team_a_summary == ""
    assert no_result.team_b_summary == "Yet to bat"
    assert won.type == 3 and won.status == "past"
    assert won.team_a_innings[0].summary.score == "311/8"
    assert won.match_summary.target == "-"


async def test_playing_squad(make_client):
    client, _ = make_client(Upstream(ok(doc("get-match-playing-squad"))))

    new_zealand, england = await client.get_match_playing_squad(458328)

    williamson, latham = new_zealand.match_squad
    assert (williamson.player_name, williamson.is_captain) == ("Kane Williamson", 1)
    assert latham.is_wicket_keeper == 1
    assert england.team_id == 362504


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
        241,
        "4.82",
    )


async def test_player_match_data(make_client):
    client, _ = make_client(
        Upstream(
            ok(doc("get-player-tournament-match-batting-data")),
            ok(doc("get-player-tournament-match-bowling-data")),
        )
    )

    batting = await client.get_player_tournament_match_batting_data(1493258, 2826925)
    bowling = await client.get_player_tournament_match_bowling_data(1493258, 2826556)

    assert batting.player_info.name == "Rohit Sharma"
    assert batting.player_info.dob == ""
    assert batting.player_data[0].is_not_out == 1
    # sr is a float, sent as 10 when whole.
    assert batting.player_data[1].sr == 10.0
    # Overs are numbers here, unlike the tournament leaderboard's strings.
    assert [row.overs for row in bowling.player_data[:2]] == [2.5, 6.0]
    # No match id: a team met twice is two indistinguishable-by-id rows.
    opponents = [row.opposition_team_name for row in bowling.player_data]
    assert opponents.count("Australia (WC19)") == 2


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

    result = await client.get_tournament_leaderboard_stats_filter(1493258)

    assert (result.season[0].key, result.season[0].value) == ("Client 2025", "1493258")
    assert (result.season[-1].key, result.season[-1].value) == ("ALL", "-1")
    orange = result.batting[0]
    assert (orange.key, orange.value) == ("Orange Cap", "RUN")
    assert orange.url.endswith("get-tournament-batting-leaderboard")
    # A filter the bowling leaderboard's own doc does not list (spec §13.3).
    assert "MODB" in [option.value for option in result.bowling]
    # One entry per team per season.
    assert [t.tournament_id for t in result.teams if t.team_id == 4660189] == [
        702687,
        1029866,
    ]


async def test_unknown_fields_are_kept(make_client):
    row = dict(doc("get-tournament-batting-leaderboard")[0], brand_new_field="kept")
    client, _ = make_client(Upstream(ok([row])))

    [parsed] = await client.get_tournament_batting_leaderboard(1493258)

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
