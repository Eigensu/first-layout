"""Importing a CricHeroes tournament's players into one of ours (spec §9.1).

CricHeroes have no roster endpoint, so the players come from the playing squad
of each played match. The upstream here is scripted by path: the match list,
and a squad per match id.
"""

import asyncio
from collections import Counter

import httpx
import pytest
import pytest_asyncio
from cricheroes_responses import refusal
from httpx import ASGITransport, AsyncClient

from app.common.enums.tournaments import TournamentStatus
from app.models.admin.audit_log import AdminActionLog
from app.models.admin.player import Player
from app.models.tournament import Tournament
from app.models.tournament_membership import ROLE_ADMIN, TournamentMembership
from app.models.user import User
from app.routes.admin.cricheroes import get_cricheroes_client, get_teams_page_reader
from app.services import cricheroes_roster
from app.services.cricheroes_client import CricHeroesClient
from app.services.cricheroes_errors import (
    CricHeroesAPIError,
    CricHeroesRateLimitError,
    CricHeroesTransportError,
)
from app.services.cricheroes_roster import RosterPlayer, fetch_roster, plan_import
from app.utils.dependencies import get_current_active_user
from app.utils.tenant import TENANT_HEADER
from config.settings import settings

BASE = "https://cricheroes.test/api/v1"
CH_TOURNAMENT = 2242502
IMPORT = f"/api/admin/cricheroes/tournaments/{CH_TOURNAMENT}/import-players"


# The documented refusals: the squad endpoint's two, and the match list's.
NO_SQUAD = refusal(170003, "Match playing squad is not found!")
NO_MATCH = refusal(170002, "Match is not found!", status=403)
NO_MATCHES = refusal(170011, "Tournament match list is not found!")
NOT_OURS = refusal(170001, "Access to this tournament is not allowed.", status=403)


def ok(data) -> httpx.Response:
    return httpx.Response(200, json={"status": True, "data": data})


def match(match_id, when, *, type=3, status="past"):
    return {
        "match_id": match_id,
        "type": type,
        "status": status,
        "match_date_time": when,
    }


def squad(team_id, team_name, *players):
    return {
        "team_id": team_id,
        "team_name": team_name,
        "match_squad": [
            {"team_id": team_id, "player_id": player_id, "player_name": name}
            for player_id, name in players
        ],
    }


class CricHeroes:
    """A scripted upstream: the match list, and each match's squads. Either
    can be a ready-made response instead, such as NO_SQUAD or a 429."""

    def __init__(self, matches, squads):
        self.matches = matches
        self.squads = squads
        self.paths: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.paths.append(path)
        if "/get-tournament-match-list/" in path:
            if isinstance(self.matches, httpx.Response):
                return self.matches
            return ok(self.matches)
        assert "/get-match-playing-squad/" in path, path
        value = self.squads.get(int(path.rsplit("/", 1)[1]), NO_SQUAD)
        return value if isinstance(value, httpx.Response) else ok(value)

    @property
    def squads_read(self) -> list[int]:
        return [
            int(path.rsplit("/", 1)[1])
            for path in self.paths
            if "/get-match-playing-squad/" in path
        ]


# Two played matches, newest second in the list, and one still to come.
# Rohit plays both; Gill moved from Titans to India in the later match.
MATCHES = [
    match(1, "2025-01-01T10:00:00.000Z"),
    match(2, "2025-01-08T10:00:00.000Z"),
    match(3, "2025-01-15T10:00:00.000Z", type=2, status="upcoming"),
]
SQUADS = {
    1: [
        squad(10, "India", (101, "Rohit Sharma"), (103, "Virat Kohli")),
        squad(20, "Titans", (201, "Shubman Gill"), (202, "Rashid Khan")),
    ],
    2: [
        squad(10, "India", (101, "Rohit Sharma"), (201, "Shubman Gill")),
        squad(30, "Royals", (301, "Sanju Samson")),
    ],
}


async def _no_sleep(_seconds: float) -> None:
    return None


@pytest_asyncio.fixture
async def upstream_client():
    """Make a real CricHeroesClient over a scripted upstream."""
    opened: list[httpx.AsyncClient] = []

    def _make(upstream: CricHeroes) -> CricHeroesClient:
        http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        opened.append(http)
        return CricHeroesClient(
            api_key="k",
            secret_access_key="s",
            udid="u",
            base_url=BASE,
            client=http,
            sleep=_no_sleep,
        )

    yield _make
    for http in opened:
        await http.aclose()


# -- collecting the roster ---------------------------------------------------


async def test_the_roster_is_everyone_in_a_played_matchs_squad(upstream_client):
    upstream = CricHeroes(MATCHES, SQUADS)
    pauses = []

    async def sleep(seconds):
        pauses.append(seconds)

    roster = await fetch_roster(upstream_client(upstream), CH_TOURNAMENT, sleep=sleep)

    by_id = {player.player_id: player for player in roster.players}
    assert sorted(by_id) == [101, 103, 201, 202, 301]
    assert by_id[101].name == "Rohit Sharma"
    # Read newest first, so a player who changed sides is on their last team.
    assert upstream.squads_read == [2, 1]
    assert by_id[201].team == "India"
    assert roster.teams == ["India", "Royals", "Titans"]
    # The upcoming match has no squad yet and is not asked for.
    assert (roster.matches_listed, roster.upcoming_matches) == (3, 1)
    assert (roster.matches_read, roster.matches_without_squad) == (2, 0)
    assert roster.calls == 3 == len(upstream.paths)
    # Calls are spaced out, below CricHeroes' rate limit.
    assert pauses == [0.05]


async def test_a_match_listed_as_upcoming_by_status_alone_is_not_read(
    upstream_client,
):
    upstream = CricHeroes([match(1, "2025-01-01", type=None, status="upcoming")], {})

    roster = await fetch_roster(upstream_client(upstream), CH_TOURNAMENT)

    assert upstream.squads_read == []
    assert roster.calls == 1 and roster.players == []


async def test_a_played_match_without_a_squad_is_passed_over(upstream_client):
    upstream = CricHeroes(
        [
            match(1, "2025-01-01"),
            match(2, "2025-01-02"),
            match(3, "2025-01-03"),
            match(4, "2025-01-04"),
        ],
        {1: SQUADS[1], 2: NO_SQUAD, 3: [squad(10, "India")], 4: NO_MATCH},
    )

    roster = await fetch_roster(upstream_client(upstream), CH_TOURNAMENT)

    assert len(roster.players) == 4
    assert (roster.matches_read, roster.matches_without_squad) == (1, 3)
    assert roster.calls == 5


async def test_any_other_failure_stops_the_roster(upstream_client):
    upstream = CricHeroes(MATCHES, {**SQUADS, 1: httpx.Response(429)})

    with pytest.raises(CricHeroesRateLimitError):
        await fetch_roster(upstream_client(upstream), CH_TOURNAMENT)


@pytest.mark.parametrize(
    "answer",
    [NOT_OURS, refusal(170099, "Something else")],
    ids=["not-in-our-agreement", "undocumented"],
)
async def test_any_other_refusal_of_a_squad_stops_the_roster(upstream_client, answer):
    """Only the squad endpoint's own "no squad" and "no such match" mean no
    squad. Another refusal could be CricHeroes turning us away; treating it as
    an empty match would import a partial roster without a word."""
    upstream = CricHeroes(MATCHES, {**SQUADS, 1: answer})

    with pytest.raises(CricHeroesAPIError):
        await fetch_roster(upstream_client(upstream), CH_TOURNAMENT)


async def test_an_upcoming_status_is_recognised_in_any_case(upstream_client):
    upstream = CricHeroes([match(1, "2025-01-01", type=None, status="Upcoming")], {})

    roster = await fetch_roster(upstream_client(upstream), CH_TOURNAMENT)

    assert upstream.squads_read == [] and roster.upcoming_matches == 1


async def test_squads_are_read_a_few_at_a_time(upstream_client):
    in_flight, peak = 0, 0
    matches = [match(i, f"2025-01-{i:02d}") for i in range(1, 13)]

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal in_flight, peak
        if "/get-tournament-match-list/" in request.url.path:
            return ok(matches)
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        match_id = int(request.url.path.rsplit("/", 1)[1])
        return ok([squad(10, "India", (match_id, f"Player {match_id}"))])

    roster = await fetch_roster(
        upstream_client(handler), CH_TOURNAMENT, sleep=_no_sleep
    )

    assert len(roster.players) == 12 and roster.calls == 13
    assert 1 < peak <= cricheroes_roster.SQUAD_CONCURRENCY


async def test_a_roster_that_takes_too_long_is_abandoned(upstream_client):
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/get-tournament-match-list/" in request.url.path:
            return ok(MATCHES)
        await asyncio.sleep(5)
        return ok(SQUADS[1])

    with pytest.raises(CricHeroesTransportError, match="longer than 0.05s"):
        await fetch_roster(
            upstream_client(handler), CH_TOURNAMENT, sleep=_no_sleep, deadline=0.05
        )


# -- deciding what to do -------------------------------------------------------


def _ch(player_id, name, team="India"):
    return RosterPlayer(player_id=player_id, name=name, team=team)


def _actions(plan):
    return {item.roster.player_id: item.action for item in plan}


async def test_a_new_name_is_created(db):
    [item] = plan_import([_ch(101, "Rohit Sharma")], [])

    assert (item.action, item.player) == ("create", None)


async def test_a_player_holding_the_id_is_already_linked(db):
    """Whatever they are called here: the id is the identity."""
    ours = Player(name="R. Sharma", team="MI", cricheroes_player_id=101)

    [item] = plan_import([_ch(101, "Rohit Sharma")], [ours])

    assert (item.action, item.player) == ("linked", ours)


async def test_one_unlinked_namesake_on_the_same_team_is_linked(db):
    ours = Player(name="rohit  SHARMA", team=" india")

    [item] = plan_import([_ch(101, "Rohit Sharma")], [ours])

    assert (item.action, item.player) == ("link", ours)


async def test_a_namesake_on_another_team_is_not_linked(db):
    """Likely someone else with a common name: linking would credit our
    player with another man's stats."""
    ours = Player(name="Rahul Patel", team="DV Spartans")

    [item] = plan_import([_ch(101, "Rahul Patel", team="Royals")], [ours])

    assert (item.action, item.player) == ("skip", ours)
    assert "DV Spartans" in item.reason and "Royals" in item.reason


async def test_two_namesakes_here_are_ambiguous(db):
    ours = [Player(name="Rahul Patel", team="A"), Player(name="Rahul Patel", team="B")]

    [item] = plan_import([_ch(101, "Rahul Patel")], ours)

    assert item.action == "skip"
    assert "sheet import" in item.reason


async def test_two_namesakes_on_cricheroes_are_ambiguous(db):
    ours = Player(name="Rahul Patel", team="A")

    plan = plan_import([_ch(101, "Rahul Patel"), _ch(102, "Rahul Patel")], [ours])

    assert _actions(plan) == {101: "skip", 102: "skip"}


async def test_two_namesakes_on_cricheroes_with_none_here_are_not_created(db):
    """Names are unique within a tournament -- the manual form refuses a
    second one and the sheet import treats a name as one player -- so two
    players of one name cannot both be added."""
    plan = plan_import([_ch(101, "Rahul Patel"), _ch(102, "rahul patel")], [])

    assert _actions(plan) == {101: "skip", 102: "skip"}
    assert "unique" in plan[0].reason


async def test_a_namesake_already_linked_elsewhere_is_not_doubled(db):
    ours = Player(name="Rahul Patel", team="A", cricheroes_player_id=999)

    [item] = plan_import([_ch(101, "Rahul Patel")], [ours])

    assert item.action == "skip"
    assert "different CricHeroes player" in item.reason


async def test_an_already_linked_namesake_does_not_make_the_name_ambiguous(db):
    """Rahul 101 is linked; the other Rahul is new and has no one to clash
    with."""
    ours = Player(name="Rahul Patel", team="A", cricheroes_player_id=101)
    unlinked = Player(name="Rahul Patel", team="India")

    plan = plan_import(
        [_ch(101, "Rahul Patel"), _ch(102, "Rahul Patel")], [ours, unlinked]
    )

    assert _actions(plan) == {101: "linked", 102: "link"}
    assert plan[1].player is unlinked


async def test_a_name_we_cannot_store_is_skipped(db):
    [item] = plan_import([_ch(101, "x" * 101)], [])

    assert item.action == "skip"
    assert "1-100" in item.reason


# -- the route -----------------------------------------------------------------


@pytest.fixture(autouse=True)
def _forget_previews():
    """Previews are kept in process memory; no test may see another's."""
    cricheroes_roster._previews.clear()
    yield
    cricheroes_roster._previews.clear()


@pytest_asyncio.fixture
async def serve():
    """Put a scripted CricHeroes behind the route; returns it for inspection."""
    from main import app

    installed: dict = {}

    async def _client():
        http = httpx.AsyncClient(transport=httpx.MockTransport(installed["upstream"]))
        try:
            async with CricHeroesClient(
                api_key="k",
                secret_access_key="s",
                udid="u",
                base_url=BASE,
                client=http,
                sleep=_no_sleep,
            ) as client:
                yield client
        finally:
            await http.aclose()

    async def _read_teams_page(tournament_id: int) -> list:
        installed["teams_page_reads"].append(tournament_id)
        registered = installed["registered"]
        if isinstance(registered, Exception):
            raise registered
        return list(registered)

    def _serve(matches=MATCHES, squads=SQUADS, registered=()) -> CricHeroes:
        """`registered`: the public Teams page's players, or an exception
        for reading it to raise."""
        installed["upstream"] = CricHeroes(matches, squads)
        installed["registered"] = registered
        installed["teams_page_reads"] = installed["upstream"].teams_page_reads = []
        return installed["upstream"]

    app.dependency_overrides[get_cricheroes_client] = _client
    app.dependency_overrides[get_teams_page_reader] = lambda: _read_teams_page
    yield _serve
    app.dependency_overrides.pop(get_cricheroes_client, None)
    app.dependency_overrides.pop(get_teams_page_reader, None)


async def _players() -> dict:
    return {player.name: player for player in await Player.find_all().to_list()}


async def test_the_preview_reports_and_writes_nothing(client, serve):
    serve()

    response = await client.post(IMPORT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["dry_run"] is True
    assert (body["created"], body["linked"], body["skipped"]) == (5, 0, 0)
    assert body["cricheroes_calls"] == 3
    assert body["teams"] == ["India", "Royals", "Titans"]
    assert {p["name"] for p in body["players"]} >= {"Rohit Sharma", "Rashid Khan"}
    assert await Player.find_all().count() == 0
    assert await AdminActionLog.find_all().count() == 0


async def test_importing_creates_the_players_unpriced_and_linked(client, serve):
    serve()

    response = await client.post(IMPORT, params={"dry_run": "false"})

    assert response.status_code == 200, response.text
    assert response.json()["created"] == 5
    players = await _players()
    rohit = players["Rohit Sharma"]
    assert (rohit.team, rohit.cricheroes_player_id) == ("India", 101)
    assert (rohit.price, rohit.points, rohit.slot, rohit.status) == (
        0.0,
        0.0,
        None,
        "Active",
    )
    assert rohit.image_url is None
    [log] = await AdminActionLog.find_all().to_list()
    assert (log.action, log.target_id) == ("player.import_cricheroes", "2242502")
    assert log.details["created"] == 5 and log.details["cricheroes_calls"] == 3


async def test_linking_gives_an_existing_player_the_id_and_nothing_else(client, serve):
    await Player(
        name="Rohit Sharma",
        team="INDIA",
        price=950.0,
        points=88.0,
        slot="slot-1",
        status="Injured",
        stats={"runs": 742},
    ).insert()
    serve()

    response = await client.post(IMPORT, params={"dry_run": "false"})

    body = response.json()
    [rohit_row] = [p for p in body["players"] if p["cricheroes_player_id"] == 101]
    assert rohit_row["action"] == "link"
    assert (rohit_row["player_name"], rohit_row["player_team"]) == (
        "Rohit Sharma",
        "INDIA",
    )
    rohit = (await _players())["Rohit Sharma"]
    assert rohit.cricheroes_player_id == 101
    assert (rohit.team, rohit.price, rohit.points, rohit.slot, rohit.status) == (
        "INDIA",
        950.0,
        88.0,
        "slot-1",
        "Injured",
    )
    assert rohit.stats == {"runs": 742}
    assert await Player.find(Player.name == "Rohit Sharma").count() == 1


async def test_importing_twice_changes_nothing_the_second_time(client, serve):
    serve()
    await client.post(IMPORT, params={"dry_run": "false"})

    response = await client.post(IMPORT, params={"dry_run": "false"})

    body = response.json()
    assert (body["created"], body["linked"], body["already_linked"]) == (0, 0, 5)
    assert await Player.find_all().count() == 5


async def test_an_upstream_failure_part_way_writes_nothing(client, serve):
    serve(squads={**SQUADS, 1: httpx.Response(429)})

    response = await client.post(IMPORT, params={"dry_run": "false"})

    assert response.status_code == 429
    assert await Player.find_all().count() == 0


async def test_a_tournament_cricheroes_has_no_data_for_is_a_404(client, serve):
    serve(matches=NO_MATCHES)

    response = await client.post(IMPORT)

    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


async def test_a_tournament_outside_our_agreement_is_a_422_saying_so(client, serve):
    serve(matches=NOT_OURS)

    response = await client.post(IMPORT, params={"dry_run": "false"})

    assert response.status_code == 422
    assert "do not give us access" in response.json()["detail"]
    assert await Player.find_all().count() == 0


async def test_the_import_writes_what_its_preview_showed_at_no_cost(client, serve):
    upstream = serve()
    await client.post(IMPORT)
    calls_for_preview = len(upstream.paths)
    # A match is played between the preview and the import.
    upstream.matches = MATCHES + [match(4, "2025-01-20T10:00:00.000Z")]
    upstream.squads = {**SQUADS, 4: [squad(40, "Kings", (401, "New Face"))]}

    response = await client.post(IMPORT, params={"dry_run": "false"})

    body = response.json()
    assert len(upstream.paths) == calls_for_preview == 3
    assert body["reused_preview"] is True and body["cricheroes_calls"] == 0
    assert body["created"] == 5
    assert "New Face" not in await _players()
    [log] = await AdminActionLog.find_all().to_list()
    assert log.details["reused_preview"] is True


async def test_an_import_without_a_recent_preview_reads_the_squads(
    client, serve, monkeypatch
):
    upstream = serve()
    await client.post(IMPORT)
    monkeypatch.setattr(cricheroes_roster, "PREVIEW_TTL_SECONDS", -1)

    response = await client.post(IMPORT, params={"dry_run": "false"})

    assert response.json()["reused_preview"] is False
    assert len(upstream.paths) == 6


async def test_two_imports_at_once_do_not_create_everyone_twice(
    client, serve, monkeypatch
):
    serve()
    insert = Player.insert

    async def slow_insert(self, *args, **kwargs):
        # A real database yields here; the in-memory one does not, which
        # would let one import finish before the other plans.
        await asyncio.sleep(0.01)
        return await insert(self, *args, **kwargs)

    monkeypatch.setattr(Player, "insert", slow_insert)

    first, second = await asyncio.gather(
        client.post(IMPORT, params={"dry_run": "false"}),
        client.post(IMPORT, params={"dry_run": "false"}),
    )

    created = [first.json()["created"], second.json()["created"]]
    assert sorted(created) == [0, 5]
    assert await Player.find_all().count() == 5


async def test_a_write_failing_part_way_is_still_recorded(client, serve, monkeypatch):
    serve()
    insert = Player.insert
    writes = Counter()

    async def failing_insert(self, *args, **kwargs):
        writes["insert"] += 1
        if writes["insert"] > 2:
            raise RuntimeError("database went away")
        return await insert(self, *args, **kwargs)

    monkeypatch.setattr(Player, "insert", failing_insert)

    with pytest.raises(RuntimeError):
        await client.post(IMPORT, params={"dry_run": "false"})

    [log] = await AdminActionLog.find_all().to_list()
    assert log.details["completed"] is False
    assert (log.details["created"], log.details["planned_created"]) == (2, 5)


async def test_a_tournament_with_nothing_played_finds_nobody(client, serve):
    upstream = serve(matches=[match(3, "2025-02-01", type=2, status="upcoming")])

    response = await client.post(IMPORT)

    body = response.json()
    assert body["players"] == [] and body["upcoming_matches"] == 1
    assert body["cricheroes_calls"] == 1 == len(upstream.paths)


# -- who may, and into which tournament ----------------------------------------


async def _user(username: str, **flags) -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        hashed_password="not-a-real-hash",
        is_active=True,
        is_verified=True,
        **flags,
    )
    await user.insert()
    return user


@pytest_asyncio.fixture
async def shared(db, monkeypatch):
    """Shared tenancy with two tournaments, and a client whose user each test
    sets with `as_user`."""
    from main import app

    monkeypatch.setattr(settings, "tenancy", "shared")
    alpha = Tournament(slug="alpha", name="Alpha", status=TournamentStatus.LIVE)
    bravo = Tournament(slug="bravo", name="Bravo", status=TournamentStatus.LIVE)
    await alpha.insert()
    await bravo.insert()

    def as_user(user: User) -> None:
        async def _signed_in():
            return user

        app.dependency_overrides[get_current_active_user] = _signed_in

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http, as_user, alpha, bravo
    app.dependency_overrides.pop(get_current_active_user, None)


async def test_a_tournament_admin_cannot_import(shared, serve):
    """Every press spends the account-wide quota (§9)."""
    http, as_user, alpha, _ = shared
    upstream = serve()
    organiser = await _user("organiser")
    await TournamentMembership(
        user_id=organiser.id,
        tournament_id=alpha.id,
        tournament_slug=alpha.slug,
        display_name="organiser",
        role=ROLE_ADMIN,
    ).insert()
    as_user(organiser)

    response = await http.post(
        IMPORT, params={"dry_run": "false"}, headers={TENANT_HEADER: "alpha"}
    )

    assert response.status_code == 403
    assert upstream.paths == []
    assert await Player.find_all().count() == 0


async def test_players_go_into_the_tournament_the_request_is_for(shared, serve):
    http, as_user, alpha, bravo = shared
    serve()
    as_user(await _user("platform", is_platform_admin=True))
    # Bravo's Rohit is someone else's business: not linked, not counted.
    await Player(tournament_id=bravo.id, name="Rohit Sharma", team="X").insert()

    response = await http.post(
        IMPORT, params={"dry_run": "false"}, headers={TENANT_HEADER: "alpha"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["created"] == 5
    in_alpha = await Player.find(Player.tournament_id == alpha.id).to_list()
    assert len(in_alpha) == 5
    bravo_rohit = await Player.find_one(Player.tournament_id == bravo.id)
    assert bravo_rohit.cricheroes_player_id is None
    [log] = await AdminActionLog.find_all().to_list()
    assert log.tournament_id == alpha.id


async def test_the_tournament_must_be_named(shared, serve):
    http, as_user, _, _ = shared
    upstream = serve()
    as_user(await _user("platform", is_platform_admin=True))

    response = await http.post(IMPORT)

    assert response.status_code == 400
    assert upstream.paths == []
