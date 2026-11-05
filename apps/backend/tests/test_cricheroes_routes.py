"""The CricHeroes admin routes, against the real app and the API doc's examples.

The route dependency is overridden with a real CricHeroesClient over a scripted
upstream, so each test runs the whole path: gate, route, client, models,
serialisation.
"""

import json
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from cricheroes_responses import refusal
from httpx import ASGITransport, AsyncClient

from app.common.enums.tournaments import TournamentStatus
from app.models.tournament import Tournament
from app.models.tournament_membership import ROLE_ADMIN, TournamentMembership
from app.models.user import User
from app.routes.admin.cricheroes import get_cricheroes_client
from app.services.cricheroes_client import CricHeroesClient
from app.utils.dependencies import get_current_active_user
from app.utils.tenant import TENANT_HEADER
from config.settings import settings

BASE = "https://cricheroes.test/api/v1"
CREDS = {"api_key": "k", "secret_access_key": "s", "udid": "u"}
PREFIX = "/api/admin/cricheroes/tournaments/2242502"

DOC = json.loads(
    (Path(__file__).parent / "fixtures" / "cricheroes_doc_examples.json").read_text()
)

ROUTES = [
    "matches",
    "point-table",
    "batting-leaderboard",
    "inning-batting-leaderboard",
    "bowling-leaderboard",
    "inning-bowling-leaderboard",
    "stats-filter",
    "boundary-count",
    "mvp",
]


def ok(data) -> httpx.Response:
    return httpx.Response(200, json={"status": True, "data": data})


class Upstream:
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
async def serve():
    """Put a scripted CricHeroes behind the routes. Call it with the responses
    upstream should give; it returns the Upstream so tests can inspect the
    requests that reached it."""
    from main import app

    installed: dict = {}

    async def _no_sleep(_seconds: float) -> None:
        return None

    async def _client():
        upstream = installed["upstream"]
        http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        try:
            async with CricHeroesClient(
                **installed["creds"], base_url=BASE, client=http, sleep=_no_sleep
            ) as client:
                yield client
        finally:
            await http.aclose()

    def _serve(*responses, creds=CREDS) -> Upstream:
        installed["upstream"] = Upstream(*responses)
        installed["creds"] = creds
        return installed["upstream"]

    app.dependency_overrides[get_cricheroes_client] = _client
    yield _serve
    app.dependency_overrides.pop(get_cricheroes_client, None)


# -- the gate --------------------------------------------------------------


@pytest.mark.parametrize("route", ROUTES)
async def test_signed_out_is_refused(anon_client, serve, route):
    upstream = serve(ok([]))

    response = await anon_client.get(f"{PREFIX}/{route}")

    assert response.status_code == 401
    assert upstream.requests == []


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
async def signed_in(db):
    """A client whose signed-in user each test sets with `as_user`."""
    from main import app

    def as_user(user: User) -> None:
        async def _signed_in():
            return user

        app.dependency_overrides[get_current_active_user] = _signed_in

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, as_user
    app.dependency_overrides.pop(get_current_active_user, None)


async def test_a_signed_in_non_admin_is_refused(signed_in, serve):
    http, as_user = signed_in
    upstream = serve(ok([]))
    as_user(await _user(username="player"))

    response = await http.get(f"{PREFIX}/matches")

    assert response.status_code == 403
    assert upstream.requests == []


async def test_a_tournament_admin_is_refused(signed_in, serve, monkeypatch):
    """The id in the path is CricHeroes', not ours, so being admin of one of
    our tournaments says nothing about it -- and every call spends the shared
    quota. Platform admins only."""
    monkeypatch.setattr(settings, "tenancy", "shared")
    http, as_user = signed_in
    upstream = serve(ok([]))
    alpha = Tournament(slug="alpha", name="Alpha", status=TournamentStatus.LIVE)
    await alpha.insert()
    organiser = await _user(username="organiser")
    await TournamentMembership(
        user_id=organiser.id,
        tournament_id=alpha.id,
        tournament_slug=alpha.slug,
        display_name="organiser",
        role=ROLE_ADMIN,
    ).insert()
    as_user(organiser)

    response = await http.get(f"{PREFIX}/matches", headers={TENANT_HEADER: "alpha"})

    assert response.status_code == 403
    assert upstream.requests == []


async def test_a_platform_admin_is_let_through(signed_in, serve, monkeypatch):
    monkeypatch.setattr(settings, "tenancy", "shared")
    http, as_user = signed_in
    upstream = serve(ok([]))
    as_user(await _user(username="platform", is_platform_admin=True))

    response = await http.get(f"{PREFIX}/matches")

    assert response.status_code == 200, response.text
    assert len(upstream.requests) == 1


# -- each route, against the doc's example ---------------------------------

# (route, the doc example it serves)
ROUTE_EXAMPLES = [
    ("matches", "get-tournament-match-list"),
    ("point-table", "get-tournament-point-table"),
    ("batting-leaderboard", "get-tournament-batting-leaderboard"),
    ("inning-batting-leaderboard", "get-tournament-inning-batting-leaderboard"),
    ("bowling-leaderboard", "get-tournament-bowling-leaderboard"),
    ("inning-bowling-leaderboard", "get-tournament-inning-bowling-leaderboard"),
    ("stats-filter", "get-tournament-stat-leaderboard-filter"),
    ("boundary-count", "get-tournament-boundary-count"),
    ("mvp", "get-tournament-player-mvp"),
]

# Upstream keys that are not usable names, which our responses must not echo.
UPSTREAM_ONLY_KEYS = {
    "4s",
    "6s",
    "50s",
    "100s",
    "3_wickets",
    "4_wickets",
    "5_wickets",
    "SR",
    "avg",
    "bbf",
    "Group",
    "Team Name",
    "Matches",
    "Won",
    "Lost",
    "Drawn",
    "Tied",
    "N/R",
    "Points",
    "Net RR",
    "Last 5",
    "GroupID",
    "RoundID",
    "RoundName",
    "Quotient",
    "TeamID",
}


def keys_anywhere(value) -> set:
    if isinstance(value, dict):
        found = set(value)
        for item in value.values():
            found |= keys_anywhere(item)
        return found
    if isinstance(value, list):
        return set().union(*(keys_anywhere(item) for item in value)) if value else set()
    return set()


def test_every_route_has_an_example():
    assert [r for r, _ in ROUTE_EXAMPLES] == ROUTES


@pytest.mark.parametrize("route, endpoint", ROUTE_EXAMPLES, ids=ROUTES)
async def test_each_route_serves_its_documented_example(client, serve, route, endpoint):
    upstream = serve(httpx.Response(200, json=DOC[endpoint]))

    response = await client.get(f"{PREFIX}/{route}")

    assert response.status_code == 200, response.text
    assert upstream.requests[0].url.path.endswith(f"/{endpoint}/2242502")
    body = response.json()
    assert body
    assert keys_anywhere(body) & UPSTREAM_ONLY_KEYS == set()


async def test_point_table_uses_clean_names(client, serve):
    serve(ok(DOC["get-tournament-point-table"]["data"]))

    response = await client.get(f"{PREFIX}/point-table")

    australia = response.json()[0]
    assert (australia["team_name"], australia["team_id"]) == (
        "Australia (WC19)",
        362535,
    )
    assert (australia["drawn"], australia["tied"], australia["no_result"]) == (
        0,
        0,
        0,
    )
    assert australia["net_rr"] == "1.065"
    assert australia["last_5"] == "W-W-W-W-W-W-W-L"


async def test_batting_leaderboard_uses_clean_names(client, serve):
    serve(ok(DOC["get-tournament-batting-leaderboard"]["data"]))

    response = await client.get(f"{PREFIX}/batting-leaderboard")

    rohit = response.json()[0]
    assert (rohit["fours"], rohit["sixes"], rohit["hundreds"]) == (67, 14, 5)
    assert rohit["strike_rate"] == "98.33"


async def test_bowling_leaderboard_uses_clean_names(client, serve):
    serve(ok(DOC["get-tournament-bowling-leaderboard"]["data"]))

    response = await client.get(f"{PREFIX}/bowling-leaderboard")

    starc = response.json()[0]
    assert (starc["strike_rate"], starc["average"], starc["overs"]) == (
        "20.52",
        18.63,
        "92.2",
    )
    assert starc["five_wickets"] == 2


async def test_inning_bowling_leaderboard_uses_clean_names(client, serve):
    serve(ok(DOC["get-tournament-inning-bowling-leaderboard"]["data"]))

    response = await client.get(f"{PREFIX}/inning-bowling-leaderboard")

    shaheen = response.json()[0]
    assert shaheen["best_bowling_figure"] == "6-35"
    assert shaheen["five_wickets"] == 1


async def test_match_list_keeps_the_nested_innings(client, serve):
    serve(ok(DOC["get-tournament-match-list"]["data"]))

    response = await client.get(f"{PREFIX}/matches")

    match = response.json()[1]
    assert match["winning_team_id"] == "362506"
    assert match["city_name"] == "Chester-le-Street"
    assert match["team_b_innings"][0]["overs_played"] == "37.2"
    assert match["team_b_innings"][0]["summary"]["score"] == "206/1"


async def test_boundary_count_is_unwrapped(client, serve):
    serve(ok(DOC["get-tournament-boundary-count"]["data"]))

    response = await client.get(f"{PREFIX}/boundary-count")

    assert response.json() == {
        "query_id": "SS_Qcv650urrl4eHDC",
        "total_six": 291,
        "total_four": 1571,
    }


async def test_mvp_table(client, serve):
    serve(ok(DOC["get-tournament-player-mvp"]["data"]))

    response = await client.get(f"{PREFIX}/mvp")

    shakib, warner = response.json()
    assert (shakib["rank"], shakib["total"], shakib["fielding"]) == (
        1,
        "94.183",
        "1.000",
    )
    assert warner["player_id"] == 2826889


async def test_unmodelled_fields_pass_through_under_upstream_names(client, serve):
    row = dict(DOC["get-tournament-batting-leaderboard"]["data"][0], brand_new="kept")
    serve(ok([row]))

    response = await client.get(f"{PREFIX}/batting-leaderboard")

    assert response.json()[0]["brand_new"] == "kept"


# -- query params ----------------------------------------------------------


async def test_query_params_are_forwarded_in_upstream_spelling(client, serve):
    upstream = serve(ok([]))

    await client.get(
        f"{PREFIX}/matches", params={"type": 3, "teamId": 7, "order": "desc"}
    )
    await client.get(f"{PREFIX}/point-table", params={"roundId": 4, "groupId": 5})
    await client.get(f"{PREFIX}/bowling-leaderboard", params={"sort_filter": "WICKET"})

    params = [dict(r.url.params) for r in upstream.requests]
    assert params == [
        {"type": "3", "teamId": "7", "order": "desc"},
        {"roundId": "4", "groupId": "5"},
        {"sort_filter": "WICKET"},
    ]


async def test_unset_query_params_are_not_forwarded(client, serve):
    upstream = serve(ok([]))

    await client.get(f"{PREFIX}/matches")

    assert upstream.requests[0].url.query == b""


# -- error mapping (spec §7) -----------------------------------------------


async def test_missing_credentials_answer_503(client, serve):
    upstream = serve(ok([]), creds={"api_key": "", "secret_access_key": "", "udid": ""})

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 503
    assert "CRICHEROES_API_KEY" in response.json()["detail"]
    assert upstream.requests == []


@pytest.mark.parametrize("status", [401, 403])
async def test_rejected_credentials_answer_502_not_401(client, serve, status):
    serve(httpx.Response(status))

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 502
    assert "CRICHEROES_SECRET_ACCESS_KEY" in response.json()["detail"]


async def test_a_firewall_block_answers_502_and_does_not_blame_the_keys(client, serve):
    serve(
        refusal(
            20250529,
            "Request blocked by security policy. (err: 20250529)",
            status=403,
        )
    )

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "firewall" in detail
    assert "CRICHEROES_SECRET_ACCESS_KEY" not in detail


async def test_an_invalid_api_key_on_a_200_answers_502_not_404(client, serve):
    serve(refusal(2002, "Invalid api-key"))

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 502
    assert "CRICHEROES_API_KEY" in response.json()["detail"]


async def test_a_tournament_outside_our_agreement_answers_422(client, serve):
    """Not 403: that is our own gate's answer, and the shared frontend client
    turns every 403 into "you do not have permission"."""
    serve(refusal(170001, "Access to this tournament is not allowed.", status=403))

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "do not give us access" in detail
    assert "CRICHEROES_SECRET_ACCESS_KEY" not in detail


async def test_throttling_answers_429_with_retry_after(client, serve):
    serve(httpx.Response(429, headers={"Retry-After": "60"}))

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "60"
    assert "quota" in response.json()["detail"]


async def test_a_429_is_not_retried_by_default(client, serve):
    """CricHeroes charge a throttled request like a successful one, so by
    default nothing retries it: one charged call, and the 429 goes back."""
    upstream = serve(httpx.Response(429))

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 429
    assert "Retry-After" not in response.headers
    assert settings.cricheroes_max_retries == 0
    assert len(upstream.requests) == 1


async def test_no_such_data_answers_404(client, serve):
    serve(refusal(170011, "Tournament match list is not found!"))

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 404
    assert "170011" in response.json()["detail"]


async def test_no_answer_answers_504(client, serve):
    serve(httpx.ConnectError("refused"))

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 504


async def test_upstream_failure_answers_502(client, serve):
    serve(httpx.Response(500, text="boom"))

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 502


async def test_unexpected_shape_answers_502_naming_the_endpoint(client, serve):
    serve(ok({"not": "a list"}))

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 502
    assert "get-tournament-match-list" in response.json()["detail"]
