"""Reading a tournament's registered players from a saved copy of its public
CricHeroes Teams page (spec §9.1), uploaded with the player import.

The page is built here in the shape the live one had on 6 Nov 2026: Next.js
flight chunks carrying `tournamentDetails` and `teamResponse`.
"""

import json

import pytest
from test_cricheroes_player_import import (  # noqa: F401  (fixtures)
    CH_TOURNAMENT,
    IMPORT,
    MATCHES,
    NO_MATCHES,
    NOT_OURS,
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
from app.services.cricheroes_roster import RosterPlayer, fetch_roster
from app.services.cricheroes_teams_page import (
    MAX_PAGE_BYTES,
    TeamsPageError,
    read_saved_teams_page,
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


def page(teams=TEAMS, *, response=None, tournament_id=CH_TOURNAMENT) -> str:
    """A saved Teams page: the tournament's details, then its team list split
    across two flight chunks as the live page splits its data."""
    response = response if response is not None else {"status": True, "data": teams}
    details = {"status": True, "data": {"tournament_id": tournament_id, "name": "T"}}
    payload = (
        '5:["$","$L1f",null,{"tournamentDetails":' + json.dumps(details) + "}]\n"
        '11:["$","$L24",null,{"teamResponse":' + json.dumps(response) + "}]\n"
    )
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


def upload(html: str) -> dict:
    return {"teams_page": ("teams.html", html.encode(), "text/html")}


# -- reading the page ---------------------------------------------------------


def test_every_registered_player_is_read_without_the_placeholder():
    players = read_saved_teams_page(page(), CH_TOURNAMENT)

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

    assert read_saved_teams_page(page(teams), CH_TOURNAMENT) == [
        RosterPlayer(1, "A", "India")
    ]


def test_a_tournament_with_no_teams_yet_has_nobody():
    assert read_saved_teams_page(page([]), CH_TOURNAMENT) == []


def test_another_tournaments_page_is_refused_naming_both():
    with pytest.raises(TeamsPageError) as raised:
        read_saved_teams_page(page(tournament_id=999), CH_TOURNAMENT)

    assert "999" in str(raised.value) and str(CH_TOURNAMENT) in str(raised.value)


@pytest.mark.parametrize(
    "html",
    [
        "<html>Some other file</html>",
        page(response={"status": False, "data": None}),
        page(response={"status": False, "data": []}),
        page(response={"data": []}),
        page([{"team_name": "India"}]),
        page([{"team_name": "India", "players": [{"player_name": "No id"}]}]),
        page().replace("tournamentDetails", "somethingElse"),
        page().replace("teamResponse", "somethingElse"),
    ],
    ids=[
        "not-a-cricheroes-page",
        "no-data",
        "failed-with-empty-data",
        "no-status",
        "team-without-players",
        "player-without-id",
        "no-tournament",
        "no-team-list",
    ],
)
def test_a_page_we_cannot_read_raises_rather_than_returning_nobody(html):
    with pytest.raises(TeamsPageError):
        read_saved_teams_page(html, CH_TOURNAMENT)


def test_the_page_to_save_is_named_by_tournament():
    assert teams_page_url(CH_TOURNAMENT) == (
        "https://cricheroes.com/tournament/2242502/teams/teams"
    )


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
        registered=read_saved_teams_page(page(), CH_TOURNAMENT),
        sleep=_no_sleep,
    )

    assert len(roster.players) == 3 and roster.calls == 1
    assert roster.teams == ["India", "Titans"]


# -- through the route --------------------------------------------------------

UPCOMING_ONLY = [match(1, "2026-11-16", type=2, status="upcoming")]


async def test_an_uploaded_page_imports_a_tournament_not_started(client, serve):
    serve(UPCOMING_ONLY, {})

    preview = (await client.post(IMPORT, files=upload(page()))).json()
    assert (preview["registered_players"], preview["registered_teams"]) == (3, 2)
    assert preview["created"] == 3 and preview["cricheroes_calls"] == 1

    response = await client.post(
        IMPORT, params={"dry_run": "false"}, files=upload(page())
    )

    assert response.status_code == 200, response.text
    assert response.json()["reused_preview"] is True
    players = await _players()
    assert set(players) == {"Rohit Sharma", "Jasprit Bumrah", "Shubman Gill"}
    assert players["Shubman Gill"].team == "Titans"
    assert players["Shubman Gill"].cricheroes_player_id == 201
    assert players["Shubman Gill"].price == 0.0
    [log] = await AdminActionLog.find_all().to_list()
    assert log.details["registered_players"] == 3
    assert log.details["registered_teams"] == 2


async def test_an_import_reuses_only_a_preview_of_the_same_page(client, serve):
    """Another tab's search without the page must not stand in for this
    one's search with it: the import writes what its own preview showed."""
    upstream = serve(UPCOMING_ONLY, {})
    await client.post(IMPORT, files=upload(page()))
    await client.post(IMPORT)  # the other tab, no page
    calls_before = len(upstream.paths)

    response = await client.post(
        IMPORT, params={"dry_run": "false"}, files=upload(page())
    )

    body = response.json()
    assert body["reused_preview"] is True and body["created"] == 3
    assert len(upstream.paths) == calls_before
    assert len(await _players()) == 3


async def test_an_import_with_a_page_never_previewed_reads_it_afresh(client, serve):
    serve(UPCOMING_ONLY, {})
    await client.post(IMPORT)  # previewed without the page

    response = await client.post(
        IMPORT, params={"dry_run": "false"}, files=upload(page())
    )

    body = response.json()
    assert body["reused_preview"] is False and body["created"] == 3


async def test_without_an_upload_the_squads_alone_are_read(client, serve):
    serve()

    body = (await client.post(IMPORT)).json()

    assert body["registered_players"] == 0 and body["created"] == 5


async def test_a_tournament_without_fixtures_imports_its_registered_players(
    client, serve
):
    """CricHeroes answer 170011 while a tournament has no fixtures yet. With
    registered players that is no matches to read, not a failure."""
    serve(matches=NO_MATCHES, squads={})

    response = await client.post(IMPORT, files=upload(page()))

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["matches_listed"], body["created"]) == (0, 3)


async def test_a_tournament_outside_our_agreement_imports_its_registered_players(
    client, serve
):
    """CricHeroes refuse the matches of a tournament outside our agreement
    (170001), but its Teams page is public. With one uploaded, its registered
    players are imported and the response says the squads were refused."""
    upstream = serve(matches=NOT_OURS, squads={})

    response = await client.post(
        IMPORT, params={"dry_run": "false"}, files=upload(page())
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["squads_refused"] is True
    assert (body["matches_listed"], body["matches_read"]) == (0, 0)
    assert (body["registered_players"], body["created"]) == (3, 3)
    assert upstream.squads_read == []
    assert await Player.find_all().count() == 3
    log = await AdminActionLog.find_one()
    assert log.details["squads_refused"] is True


async def test_a_readable_tournament_does_not_report_refused_squads(client, serve):
    serve()

    body = (await client.post(IMPORT, files=upload(page()))).json()

    assert body["squads_refused"] is False


async def test_a_squad_refused_from_a_listed_match_still_fails_with_a_teams_page(
    client, serve
):
    """Only a refused match list falls back to the Teams page. A squad refused
    from a match CricHeroes did list would leave a partial roster."""
    serve(squads={**SQUADS, 1: NOT_OURS})

    response = await client.post(
        IMPORT, params={"dry_run": "false"}, files=upload(page())
    )

    assert response.status_code == 422
    assert await Player.find_all().count() == 0


async def test_without_registered_players_a_missing_match_list_is_still_a_404(
    client, serve
):
    serve(matches=NO_MATCHES)

    assert (await client.post(IMPORT)).status_code == 404


@pytest.mark.parametrize(
    "html",
    ["<html>not it</html>", page(tournament_id=999)],
    ids=["unreadable", "another-tournament"],
)
async def test_a_bad_upload_is_a_422_before_any_api_call(client, serve, html):
    upstream = serve()

    response = await client.post(
        IMPORT, params={"dry_run": "false"}, files=upload(html)
    )

    assert response.status_code == 422
    assert "uploaded" in response.json()["detail"]
    assert upstream.paths == []
    assert await Player.find_all().count() == 0


async def test_an_oversized_upload_is_refused(client, serve):
    upstream = serve()

    response = await client.post(IMPORT, files=upload("x" * (MAX_PAGE_BYTES + 1)))

    assert response.status_code == 422
    assert upstream.paths == []
