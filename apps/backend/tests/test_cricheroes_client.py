"""CricHeroesClient against a scripted upstream (httpx.MockTransport).

No network. The batting-leaderboard and stats-filter bodies are trimmed from the
API doc's own examples; the others are minimal bodies built from the values the
doc shows for the field under test (spec §8.2).
"""

import logging

import httpx
import pytest
import pytest_asyncio

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

ROHIT = {
    "player_id": 2826925,
    "name": "Rohit Sharma",
    "profile_photo": "https://images.cricheroes.in/user_profile/1559199665813_MehNW6eg0C8a.jpg",
    "total_match": 9,
    "innings": 9,
    "total_runs": 648,
    "highest_run": 140,
    "highest_run_with_not_out": "",
    "average": "81.00",
    "not_out": 1,
    "4s": 67,
    "6s": 14,
    "50s": 1,
    "100s": 5,
    "strike_rate": "98.33",
    "team_id": 362508,
    "team_name": "India (WC19)",
    "ball_faced": 659,
    "batting_hand": "RHB",
}

STATS_FILTER = {
    "season": [
        {"key": "Client 2025", "value": "1493258"},
        {"key": "Client 2024", "value": "1029866"},
    ],
    "batting": [
        {
            "key": "Orange Cap",
            "url": "thirdparty/client/get-tournament-batting-leaderboard",
        }
    ],
    "bowling": [
        {
            "key": "Purple Cap",
            "url": "thirdparty/client/get-tournament-bowling-leaderboard",
        }
    ],
    "teams": [{"team_id": 4660189, "team_name": "PUNERI BAPPA"}],
}


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


# -- params and paths ------------------------------------------------------


async def test_unset_params_are_omitted_not_sent_empty(make_client):
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream)

    await client.get_tournament_match_list(1493258)

    assert upstream.requests[0].url.query == b""


async def test_params_use_the_upstream_spellings(make_client):
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream)

    await client.get_tournament_match_list(1, match_type=3, team_id=7, order="desc")
    await client.get_tournament_point_table(1, round_id=4, group_id=5)
    await client.get_tournament_batting_leaderboard(1, sort_filter="RUN")

    params = [dict(r.url.params) for r in upstream.requests]
    assert params[0] == {"type": "3", "teamId": "7", "order": "desc"}
    assert params[1] == {"roundId": "4", "groupId": "5"}
    assert params[2] == {"sort_filter": "RUN"}


@pytest.mark.parametrize(
    "method, path",
    [
        ("get_tournament_batting_leaderboard", "get-tournament-batting-leaderboard"),
        (
            "get_tournament_inning_batting_leaderboard",
            "get-tournament-inning-batting-leaderboard",
        ),
        ("get_tournament_bowling_leaderboard", "get-tournament-bowling-leaderboard"),
        (
            "get_tournament_inning_bowling_leaderboard",
            "get-tournament-inning-bowling-leaderboard",
        ),
    ],
)
async def test_leaderboard_paths(make_client, method, path):
    upstream = Upstream(ok([]))
    client, _ = make_client(upstream)

    await getattr(client, method)(1493258)

    assert upstream.requests[0].url.path.endswith(f"/{path}/1493258")


async def test_current_partnership_and_partnership_share_a_path(make_client):
    upstream = Upstream(
        ok({"to_over": "-", "runs": 12}),
        ok([{"to_over": "4.2"}, {"to_over": "-"}]),
    )
    client, _ = make_client(upstream)

    current = await client.get_match_current_partnership(55)
    every = await client.get_match_partnership(55, 9)

    paths = [r.url.path for r in upstream.requests]
    assert paths[0].endswith("/get-match-current-partnership/55")
    assert paths[1].endswith("/get-match-current-partnership/55/9")
    assert current.to_over == "-"
    assert [p.to_over for p in every] == ["4.2", "-"]


async def test_unmodelled_endpoints_return_the_raw_data(make_client):
    squad = {"team_a": [{"player_id": 1}], "team_b": []}
    upstream = Upstream(ok(squad))
    client, _ = make_client(upstream)

    assert await client.get_match_playing_squad(55, team_id=9) == squad
    assert dict(upstream.requests[0].url.params) == {"teamId": "9"}


# -- shapes ----------------------------------------------------------------


async def test_boundary_count_one_element_list_is_unwrapped(make_client):
    client, _ = make_client(Upstream(ok([{"total_fours": 310, "total_sixes": 122}])))

    result = await client.get_tournament_boundary_count(1493258)

    assert result.model_extra == {"total_fours": 310, "total_sixes": 122}


async def test_list_endpoint_answering_an_object_raises_schema_error(make_client):
    client, _ = make_client(Upstream(ok({"rows": []})))

    with pytest.raises(CricHeroesSchemaError) as caught:
        await client.get_tournament_match_list(1493258)

    # A subclass, so routes map it to 502 with the other upstream failures.
    assert isinstance(caught.value, CricHeroesHTTPError)
    assert "get-tournament-match-list" in str(caught.value)
    assert "expected a list" in str(caught.value)


async def test_a_field_that_does_not_fit_raises_schema_error(make_client):
    body = dict(STATS_FILTER, teams=[{"team_id": "not-a-number", "team_name": "X"}])
    client, _ = make_client(Upstream(ok(body)))

    with pytest.raises(CricHeroesSchemaError) as caught:
        await client.get_tournament_leaderboard_stats_filter(1493258)

    assert "get-tournament-stat-leaderboard-filter" in str(caught.value)
    assert "team_id" in str(caught.value)


async def test_an_empty_data_list_is_an_empty_result(make_client):
    client, _ = make_client(Upstream(ok(None)))

    assert await client.get_tournament_match_list(1493258) == []


# -- payload parsing: aliases and type traps (spec §8) ---------------------


async def test_batting_leaderboard_parses_the_documented_example(make_client):
    client, _ = make_client(Upstream(ok([ROHIT])))

    [row] = await client.get_tournament_batting_leaderboard(1493258)

    assert row.player_id == 2826925
    assert (row.fours, row.sixes, row.fifties, row.hundreds) == (67, 14, 1, 5)
    # Strings on this leaderboard, and kept as strings.
    assert row.strike_rate == "98.33"
    assert row.average == "81.00"
    assert row.highest_run_with_not_out == ""
    assert row.model_extra == {}


async def test_inning_batting_strike_rate_is_a_float(make_client):
    client, _ = make_client(Upstream(ok([{"strike_rate": 112.925, "4s": 9}])))

    [row] = await client.get_tournament_inning_batting_leaderboard(1493258)

    assert row.strike_rate == 112.925
    assert row.fours == 9


async def test_bowling_leaderboard_aliases_and_types(make_client):
    body = [
        {
            "SR": 14.2,
            "avg": 18.63,
            "overs": "92.2",
            "3_wickets": 2,
            "4_wickets": 1,
            "5_wickets": 0,
        }
    ]
    client, _ = make_client(Upstream(ok(body)))

    [row] = await client.get_tournament_bowling_leaderboard(1493258)

    assert row.strike_rate == 14.2
    assert row.average == 18.63
    assert row.overs == "92.2"
    assert (row.three_wickets, row.four_wickets, row.five_wickets) == (2, 1, 0)


async def test_a_number_where_the_doc_shows_a_string_stays_a_string(make_client):
    client, _ = make_client(Upstream(ok([{"overs": 92}])))

    [row] = await client.get_tournament_bowling_leaderboard(1493258)

    assert row.overs == "92"


async def test_point_table_aliases(make_client):
    body = [
        {
            "Group": "A",
            "Team Name": "PUNERI BAPPA",
            "Matches": 5,
            "Won": 4,
            "Lost": 1,
            "N/R": 0,
            "Points": 8,
            "Net RR": "+1.234",
            "Last 5": "WWLWW",
            "GroupID": 11,
            "RoundID": 3,
            "RoundName": "League",
        }
    ]
    client, _ = make_client(Upstream(ok(body)))

    [row] = await client.get_tournament_point_table(1493258)

    assert row.team_name == "PUNERI BAPPA"
    assert (row.matches, row.won, row.lost, row.no_result, row.points) == (
        5,
        4,
        1,
        0,
        8,
    )
    assert row.net_rr == "+1.234"
    assert row.last_5 == "WWLWW"
    assert (row.group, row.group_id, row.round_id, row.round_name) == (
        "A",
        11,
        3,
        "League",
    )


@pytest.mark.parametrize("winner", ["", "0", "362504"])
async def test_match_list_winning_team_id_stays_a_string(make_client, winner):
    body = [{"winning_team_id": winner, "revised_target": 0, "revised_overs": 0}]
    client, _ = make_client(Upstream(ok(body)))

    [match] = await client.get_tournament_match_list(1493258)

    assert match.winning_team_id == winner
    assert match.revised_target == 0


async def test_batting_season_career_row_and_aliases(make_client):
    body = [
        {
            "year": "Career",
            "mat": 40,
            "no": 6,
            "hs": 140,
            "bf": 900,
            "sr": "102.3",
            "avg": "44.1",
            "4s": 80,
        },
        {"year": "2023", "mat": 12},
    ]
    client, _ = make_client(Upstream(ok(body)))

    career, season = await client.get_player_batting_season_data(2826925)

    assert career.year == "Career" and season.year == "2023"
    assert (career.matches, career.not_outs, career.highest_score) == (40, 6, 140)
    assert (career.balls_faced, career.strike_rate, career.average) == (
        900,
        "102.3",
        "44.1",
    )
    assert career.fours == 80


async def test_bowling_season_balls_is_int_on_career_and_str_on_seasons(make_client):
    body = [
        {
            "year": "Career",
            "balls": 1200,
            "bbm": "5/21",
            "ave": 18.6,
            "econ": 6.1,
            "5_wickets": 1,
        },
        {"year": "2024", "balls": "300"},
    ]
    client, _ = make_client(Upstream(ok(body)))

    career, season = await client.get_player_bowling_season_data(2826925)

    assert career.balls == 1200
    assert season.balls == "300"
    assert (career.best_bowling, career.average, career.economy) == ("5/21", 18.6, 6.1)
    assert career.five_wickets == 1


async def test_stats_filter_parses_the_documented_shape(make_client):
    client, _ = make_client(Upstream(ok(STATS_FILTER)))

    result = await client.get_tournament_leaderboard_stats_filter(1493258)

    assert [(s.key, s.value) for s in result.season] == [
        ("Client 2025", "1493258"),
        ("Client 2024", "1029866"),
    ]
    assert result.batting[0].key == "Orange Cap"
    assert result.bowling[0].url.endswith("get-tournament-bowling-leaderboard")
    assert result.teams[0].team_id == 4660189


async def test_unknown_fields_are_kept(make_client):
    client, _ = make_client(Upstream(ok([dict(ROHIT, brand_new_field="kept")])))

    [row] = await client.get_tournament_batting_leaderboard(1493258)

    assert row.model_extra == {"brand_new_field": "kept"}
    assert row.model_dump()["brand_new_field"] == "kept"


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
