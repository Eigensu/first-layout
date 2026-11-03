"""The CricHeroes admin routes, against the real app.

The route dependency is overridden with a real CricHeroesClient over a scripted
upstream, so each test runs the whole path: gate, route, client, models,
serialisation.
"""

import httpx
import pytest
import pytest_asyncio
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
PREFIX = "/api/admin/cricheroes/tournaments/1493258"

ROUTES = [
    "matches",
    "point-table",
    "batting-leaderboard",
    "inning-batting-leaderboard",
    "bowling-leaderboard",
    "inning-bowling-leaderboard",
    "stats-filter",
    "boundary-count",
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


# -- each route ------------------------------------------------------------


async def test_matches(client, serve):
    serve(ok([{"match_id": 1, "winning_team_id": "362504", "revised_target": 0}]))

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 200, response.text
    [match] = response.json()
    assert match["winning_team_id"] == "362504"
    assert match["match_id"] == 1


async def test_point_table_uses_clean_names(client, serve):
    serve(
        ok(
            [
                {
                    "Team Name": "PUNERI BAPPA",
                    "Net RR": "+1.234",
                    "N/R": 0,
                    "Last 5": "WWLWW",
                }
            ]
        )
    )

    response = await client.get(f"{PREFIX}/point-table")

    assert response.status_code == 200, response.text
    [row] = response.json()
    assert row["team_name"] == "PUNERI BAPPA"
    assert row["net_rr"] == "+1.234"
    assert row["no_result"] == 0
    assert row["last_5"] == "WWLWW"
    assert "Team Name" not in row


async def test_batting_leaderboard_uses_clean_names(client, serve):
    serve(
        ok([{"player_id": 1, "name": "X", "4s": 67, "6s": 14, "strike_rate": "98.33"}])
    )

    response = await client.get(f"{PREFIX}/batting-leaderboard")

    assert response.status_code == 200, response.text
    [row] = response.json()
    assert (row["fours"], row["sixes"], row["strike_rate"]) == (67, 14, "98.33")
    assert "4s" not in row


async def test_inning_batting_leaderboard(client, serve):
    serve(ok([{"strike_rate": 112.925, "100s": 1}]))

    response = await client.get(f"{PREFIX}/inning-batting-leaderboard")

    assert response.status_code == 200, response.text
    assert response.json() == [
        {
            "strike_rate": 112.925,
            "fours": None,
            "sixes": None,
            "fifties": None,
            "hundreds": 1,
        }
    ]


async def test_bowling_leaderboard_uses_clean_names(client, serve):
    serve(ok([{"SR": 14.2, "avg": 18.63, "overs": "92.2", "5_wickets": 1}]))

    response = await client.get(f"{PREFIX}/bowling-leaderboard")

    assert response.status_code == 200, response.text
    [row] = response.json()
    assert (row["strike_rate"], row["average"], row["overs"]) == (14.2, 18.63, "92.2")
    assert row["five_wickets"] == 1


async def test_inning_bowling_leaderboard(client, serve):
    serve(ok([{"3_wickets": 1}]))

    response = await client.get(f"{PREFIX}/inning-bowling-leaderboard")

    assert response.status_code == 200, response.text
    assert response.json()[0]["three_wickets"] == 1


async def test_stats_filter(client, serve):
    serve(
        ok(
            {
                "season": [{"key": "Client 2025", "value": "1493258"}],
                "batting": [{"key": "Orange Cap", "url": "thirdparty/client/x"}],
                "bowling": [],
                "teams": [{"team_id": 4660189, "team_name": "PUNERI BAPPA"}],
            }
        )
    )

    response = await client.get(f"{PREFIX}/stats-filter")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["season"] == [{"key": "Client 2025", "value": "1493258"}]
    assert body["teams"][0]["team_name"] == "PUNERI BAPPA"


async def test_boundary_count_is_unwrapped(client, serve):
    serve(ok([{"total_fours": 310, "total_sixes": 122}]))

    response = await client.get(f"{PREFIX}/boundary-count")

    assert response.status_code == 200, response.text
    assert response.json() == {"total_fours": 310, "total_sixes": 122}


async def test_unmodelled_fields_pass_through_under_upstream_names(client, serve):
    serve(ok([{"player_id": 1, "name": "X", "brand_new_field": "kept"}]))

    response = await client.get(f"{PREFIX}/batting-leaderboard")

    assert response.json()[0]["brand_new_field"] == "kept"


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


async def test_throttling_answers_429_with_retry_after(client, serve):
    serve(httpx.Response(429, headers={"Retry-After": "60"}))

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "60"
    assert "quota" in response.json()["detail"]


async def test_throttling_without_retry_after_sends_none(client, serve):
    upstream = serve(httpx.Response(429))

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 429
    assert "Retry-After" not in response.headers
    # The configured retries ran before giving up.
    assert len(upstream.requests) == 1 + settings.cricheroes_max_retries


async def test_no_such_data_answers_404(client, serve):
    serve(
        httpx.Response(
            200, json={"status": False, "error": {"code": 96001, "message": "No data"}}
        )
    )

    response = await client.get(f"{PREFIX}/matches")

    assert response.status_code == 404
    assert "96001" in response.json()["detail"]


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
