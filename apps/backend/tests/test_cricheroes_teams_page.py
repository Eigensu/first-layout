"""Reading a tournament's registered players off CricHeroes' public Teams page
(spec §9.1), and folding them into the player import.

No test reaches cricheroes.com: the page is built here in the shape the live
one had on 6 Nov 2026 -- Next.js flight chunks carrying a `teamResponse`.
"""

import json

import httpx
import pytest
from test_cricheroes_player_import import (  # noqa: F401  (fixtures)
    CH_TOURNAMENT,
    IMPORT,
    MATCHES,
    NO_MATCHES,
    SQUADS,
    CricHeroes,
    _forget_previews,
    _no_sleep,
    _players,
    match,
    serve,
    upstream_client,
)

from app.models.admin.audit_log import AdminActionLog
from app.models.admin.player import Player
from app.services.cricheroes_errors import CricHeroesTransportError
from app.services.cricheroes_roster import RosterPlayer, fetch_roster
from app.services.cricheroes_teams_page import (
    USER_AGENT,
    CricHeroesPageError,
    parse_teams_page,
    read_registered_players,
    teams_page_url,
)

DUMMY_ID = 13559564
TEAMS = [
    {
        "team_id": 10,
        "team_name": "India",
        "players": [
            {"player_id": 101, "player_name": "Rohit Sharma", "profile_photo": "x"},
            {"player_id": 104, "player_name": "Jasprit Bumrah"},
            {"player_id": DUMMY_ID, "player_name": "Dummy"},
        ],
    },
    {
        "team_id": 20,
        "team_name": "Titans",
        "players": [
            {"player_id": 201, "player_name": "Shubman Gill"},
            {"player_id": DUMMY_ID, "player_name": " dummy "},
        ],
    },
]


def page(teams=TEAMS, *, response=None) -> str:
    """A Teams page: the team list split across two flight chunks, as the
    live page splits its data, among unrelated scripts."""
    response = response if response is not None else {"status": True, "data": teams}
    payload = '11:["$","$L24",null,{"teamResponse":' + json.dumps(response) + "}]\n"
    half = len(payload) // 2

    def chunk(text: str) -> str:
        return f"<script>self.__next_f.push([1,{json.dumps(text)}])</script>"

    return (
        "<html><body><script>self.__next_f.push([0])</script>"
        + chunk('0:{"P":null}\n')
        + chunk(payload[:half])
        + chunk(payload[half:])
        + "</body></html>"
    )


# -- parsing ------------------------------------------------------------------


def test_every_registered_player_is_read_without_the_placeholder():
    players = parse_teams_page(page())

    assert players == [
        RosterPlayer(101, "Rohit Sharma", "India"),
        RosterPlayer(104, "Jasprit Bumrah", "India"),
        RosterPlayer(201, "Shubman Gill", "Titans"),
    ]


def test_a_player_listed_twice_is_kept_under_their_first_team():
    teams = [
        {"team_name": "India", "players": [{"player_id": 1, "player_name": "A"}]},
        {"team_name": "Titans", "players": [{"player_id": 1, "player_name": "A"}]},
    ]

    assert parse_teams_page(page(teams)) == [RosterPlayer(1, "A", "India")]


def test_a_tournament_with_no_teams_yet_has_nobody():
    assert parse_teams_page(page([])) == []


@pytest.mark.parametrize(
    "html",
    [
        "<html>Tournament not found</html>",
        page(response={"status": False, "data": None}),
        page(response={"status": False, "data": []}),
        page(response={"data": []}),
        page([{"team_name": "India"}]),
        page([{"team_name": "India", "players": [{"player_name": "No id"}]}]),
    ],
    ids=[
        "no-team-list",
        "no-data",
        "failed-with-empty-data",
        "no-status",
        "team-without-players",
        "player-without-id",
    ],
)
def test_a_page_we_cannot_read_raises_rather_than_returning_nobody(html):
    with pytest.raises(CricHeroesPageError):
        parse_teams_page(html, url="u")


# -- fetching -----------------------------------------------------------------


async def test_the_page_is_fetched_naming_our_app():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, text=page())

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        players = await read_registered_players(
            CH_TOURNAMENT, client=http, base_url="https://web.test"
        )

    assert len(players) == 3
    [request] = seen
    assert str(request.url) == teams_page_url(CH_TOURNAMENT, "https://web.test")
    assert request.headers["User-Agent"] == USER_AGENT


async def test_a_refused_page_raises_with_its_status():
    transport = httpx.MockTransport(lambda request: httpx.Response(403, text="no"))
    async with httpx.AsyncClient(transport=transport) as http:
        with pytest.raises(CricHeroesPageError) as raised:
            await read_registered_players(CH_TOURNAMENT, client=http)

    assert raised.value.status_code == 403 and "HTTP 403" in str(raised.value)


async def test_an_unreachable_page_is_a_transport_error():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(CricHeroesTransportError):
            await read_registered_players(CH_TOURNAMENT, client=http)


# -- merged into the roster ---------------------------------------------------


async def test_registered_players_join_the_squads_and_a_squad_team_wins(
    upstream_client,
):
    registered = [
        RosterPlayer(101, "Rohit Sharma", "India"),
        RosterPlayer(104, "Jasprit Bumrah", "India"),
        # Registered with Titans, but played for India in the latest match.
        RosterPlayer(201, "Shubman Gill", "Titans"),
    ]
    upstream = CricHeroes(MATCHES, SQUADS)

    roster = await fetch_roster(
        upstream_client(upstream), CH_TOURNAMENT, registered=registered
    )

    by_id = {player.player_id: player for player in roster.players}
    assert sorted(by_id) == [101, 103, 104, 201, 202, 301]
    assert by_id[104].team == "India"
    assert by_id[201].team == "India"
    assert (roster.registered_players, roster.registered_teams) == (3, 2)
    assert roster.calls == 3


async def test_before_the_first_match_the_registered_players_are_the_roster(
    upstream_client,
):
    upstream = CricHeroes([match(1, "2026-11-16", type=2, status="upcoming")], {})

    roster = await fetch_roster(
        upstream_client(upstream),
        CH_TOURNAMENT,
        registered=parse_teams_page(page()),
        sleep=_no_sleep,
    )

    assert len(roster.players) == 3 and roster.calls == 1
    assert roster.teams == ["India", "Titans"]


# -- through the route --------------------------------------------------------

UPCOMING_ONLY = [match(1, "2026-11-16", type=2, status="upcoming")]


async def test_a_tournament_not_started_imports_its_registered_players(client, serve):
    serve(UPCOMING_ONLY, {}, registered=parse_teams_page(page()))

    preview = (await client.post(IMPORT)).json()
    assert (preview["registered_players"], preview["registered_teams"]) == (3, 2)
    assert preview["created"] == 3 and preview["cricheroes_calls"] == 1

    response = await client.post(IMPORT, params={"dry_run": "false"})

    assert response.status_code == 200, response.text
    players = await _players()
    assert set(players) == {"Rohit Sharma", "Jasprit Bumrah", "Shubman Gill"}
    assert players["Shubman Gill"].team == "Titans"
    assert players["Shubman Gill"].cricheroes_player_id == 201
    assert players["Shubman Gill"].price == 0.0
    [log] = await AdminActionLog.find_all().to_list()
    assert log.details["registered_players"] == 3
    assert log.details["registered_teams"] == 2


async def test_a_tournament_without_fixtures_imports_its_registered_players(
    client, serve
):
    """CricHeroes answer 170011 while a tournament has no fixtures yet. With
    registered players that is no matches to read, not a failure."""
    serve(matches=NO_MATCHES, squads={}, registered=parse_teams_page(page()))

    response = await client.post(IMPORT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["matches_listed"], body["created"]) == (0, 3)


async def test_without_registered_players_a_missing_match_list_is_still_a_404(
    client, serve
):
    serve(matches=NO_MATCHES, registered=[])

    assert (await client.post(IMPORT)).status_code == 404


async def test_an_import_that_reuses_its_preview_does_not_read_the_page_again(
    client, serve
):
    upstream = serve(UPCOMING_ONLY, {}, registered=parse_teams_page(page()))

    await client.post(IMPORT)
    response = await client.post(IMPORT, params={"dry_run": "false"})

    assert response.json()["reused_preview"] is True
    assert upstream.teams_page_reads == [CH_TOURNAMENT]


async def test_an_unreadable_page_fails_the_search_before_any_api_call(client, serve):
    upstream = serve(registered=CricHeroesPageError("u", "has no team list."))

    response = await client.post(IMPORT, params={"dry_run": "false"})

    assert response.status_code == 502
    assert "Teams page" in response.json()["detail"]
    assert upstream.paths == []
    assert await Player.find_all().count() == 0
