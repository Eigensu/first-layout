"""Who may administer what (spec stage D).

Under TENANCY=shared, admin is a role in one tournament, held on that
tournament's membership, plus a short allowlist of platform admins who run the
registry and every tournament. Admin pages stay on each tournament's own
subdomain, which the frontend names in X-Tournament-Slug.

The migration clears the legacy global is_admin on every account, but a stray
one must still grant nothing here: honouring it would make every legacy admin
an admin of every tournament.

A legacy single-tournament service keeps is_admin, exactly as before.
"""

from datetime import timedelta

import pytest
import pytest_asyncio
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient

from app.common.enums.tournaments import TournamentStatus
from app.models.contest import Contest
from app.models.team import Team
from app.models.tournament import Tournament
from app.models.tournament_membership import (
    ROLE_ADMIN,
    ROLE_PLAYER,
    TournamentMembership,
)
from app.models.user import User
from app.utils.dependencies import (
    get_current_active_user,
    get_platform_admin,
    get_tournament_admin,
)
from app.utils.tenant import TENANT_HEADER
from app.utils.timezone import now_ist
from config.settings import settings

ALPHA = {TENANT_HEADER: "alpha"}
BRAVO = {TENANT_HEADER: "bravo"}
CLOSED = {TENANT_HEADER: "closed"}

# A route from each admin router. Each answers 200 to an admin of the tournament
# with nothing seeded beyond the tournaments themselves.
TOURNAMENT_ADMIN_ROUTES = [
    "/api/admin/contests",
    "/api/admin/players",
    "/api/admin/slots",
    "/api/admin/settings",
    "/api/admin/users-with-teams",
    "/api/admin/players/import/logs",
    "/api/v1/sponsors/available-priorities",
]
REGISTRY = "/api/admin/tournaments"
# Admin routes that belong to no one tournament, so only a platform admin may
# use them. CricHeroes takes a CricHeroes tournament id, unrelated to ours, and
# every call spends the platform's one annual quota
# (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9).
PLATFORM_ADMIN_PREFIXES = (REGISTRY, "/api/admin/cricheroes")


@pytest.fixture
def shared(monkeypatch):
    monkeypatch.setattr(settings, "tenancy", "shared")


async def _user(name: str, **flags) -> User:
    user = User(
        username=name,
        email=f"{name}@example.com",
        hashed_password="not-a-real-hash",
        is_active=True,
        is_verified=True,
        **flags,
    )
    await user.insert()
    return user


async def _member(user: User, tournament: Tournament, role: str) -> None:
    await TournamentMembership(
        user_id=user.id,
        tournament_id=tournament.id,
        tournament_slug=tournament.slug,
        display_name=user.username,
        role=role,
    ).insert()


@pytest_asyncio.fixture
async def people(db):
    alpha = Tournament(slug="alpha", name="Alpha", status=TournamentStatus.LIVE)
    bravo = Tournament(slug="bravo", name="Bravo", status=TournamentStatus.LIVE)
    closed = Tournament(slug="closed", name="Closed", status=TournamentStatus.ARCHIVED)
    for t in (alpha, bravo, closed):
        await t.insert()

    # Runs alpha, plays bravo, and ran a tournament since archived.
    organiser = await _user("organiser")
    await _member(organiser, alpha, ROLE_ADMIN)
    await _member(organiser, bravo, ROLE_PLAYER)
    await _member(organiser, closed, ROLE_ADMIN)

    player = await _user("player")
    await _member(player, alpha, ROLE_PLAYER)

    # An admin in some legacy service, whose flag survived somehow.
    legacy = await _user("legacy", is_admin=True)
    await _member(legacy, alpha, ROLE_PLAYER)

    platform = await _user("platform", is_platform_admin=True)

    return {
        "organiser": organiser,
        "player": player,
        "legacy": legacy,
        "platform": platform,
        "alpha": alpha,
        "bravo": bravo,
    }


@pytest_asyncio.fixture
async def http(db):
    """A client whose signed-in user is set per request by `as_user`."""
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_current_active_user, None)


def as_user(user: User) -> None:
    from main import app

    async def _signed_in():
        return user

    app.dependency_overrides[get_current_active_user] = _signed_in


async def _get(http, user, path, headers=None):
    as_user(user)
    return await http.get(path, headers=headers or {})


# --- shared tenancy: admin is per tournament ------------------------------------


@pytest.mark.parametrize("path", TOURNAMENT_ADMIN_ROUTES)
async def test_a_tournament_admin_administers_their_tournament(
    shared, people, http, path
):
    response = await _get(http, people["organiser"], path, ALPHA)
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("path", TOURNAMENT_ADMIN_ROUTES)
async def test_and_nowhere_else(shared, people, http, path):
    """They play in bravo. Admin of alpha is nothing there."""
    response = await _get(http, people["organiser"], path, BRAVO)
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required"


@pytest.mark.parametrize("path", TOURNAMENT_ADMIN_ROUTES)
async def test_a_player_is_refused(shared, people, http, path):
    response = await _get(http, people["player"], path, ALPHA)
    assert response.status_code == 403


@pytest.mark.parametrize("path", TOURNAMENT_ADMIN_ROUTES)
async def test_the_legacy_admin_flag_grants_nothing(shared, people, http, path):
    response = await _get(http, people["legacy"], path, ALPHA)
    assert response.status_code == 403


@pytest.mark.parametrize("path", TOURNAMENT_ADMIN_ROUTES)
@pytest.mark.parametrize("headers", [ALPHA, BRAVO], ids=["alpha", "bravo"])
async def test_a_platform_admin_administers_every_tournament(
    shared, people, http, path, headers
):
    response = await _get(http, people["platform"], path, headers)
    assert response.status_code == 200, response.text


async def test_an_archived_tournament_has_no_admin(shared, people, http):
    """The organiser ran it; it is closed now, and so is its admin."""
    response = await _get(http, people["organiser"], "/api/admin/contests", CLOSED)
    assert response.status_code == 400
    assert response.json()["detail"] == "Unknown tournament"


async def test_admin_without_a_tournament_is_refused(shared, people, http):
    response = await _get(http, people["organiser"], "/api/admin/contests")
    assert response.status_code == 400


async def test_signed_out_is_refused_before_the_tournament_is_read(
    shared, people, anon_client
):
    assert (await anon_client.get("/api/admin/contests")).status_code == 401


async def test_only_a_platform_admin_runs_the_registry(shared, people, http):
    for name in ("organiser", "player", "legacy"):
        response = await _get(http, people[name], REGISTRY, ALPHA)
        assert response.status_code == 403, name
        assert response.json()["detail"] == "Platform admin access required"

    # The registry is not one tournament's, so it needs no header.
    assert (await _get(http, people["platform"], REGISTRY)).status_code == 200


async def test_a_refused_admin_changed_nothing(shared, people, http):
    """A write, not just a read: alpha's admin cannot create bravo's contest."""
    start = now_ist()
    contest = {
        "code": "FINAL",
        "name": "Final",
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(days=1)).isoformat(),
    }

    as_user(people["organiser"])
    response = await http.post("/api/admin/contests", headers=BRAVO, json=contest)
    assert response.status_code == 403
    assert await Contest.find_all().count() == 0

    # The same request from someone allowed is a valid one.
    as_user(people["platform"])
    response = await http.post("/api/admin/contests", headers=BRAVO, json=contest)
    assert response.status_code in (200, 201), response.text
    assert await Contest.find(Contest.tournament_id == people["bravo"].id).count() == 1


# --- what /api/users/me tells the frontend --------------------------------------


async def _me(http, user, headers=None):
    response = await _get(http, user, "/api/users/me", headers)
    assert response.status_code == 200, response.text
    body = response.json()
    return body["is_admin"], body["is_platform_admin"]


async def test_me_reports_admin_of_the_tournament_asked_from(shared, people, http):
    organiser = people["organiser"]
    assert await _me(http, organiser, ALPHA) == (True, False)
    assert await _me(http, organiser, BRAVO) == (False, False)


@pytest.mark.parametrize(
    "headers",
    [{}, {TENANT_HEADER: "nowhere"}, CLOSED],
    ids=["apex", "unknown", "archived"],
)
async def test_me_answers_without_a_tournament(shared, people, http, headers):
    """The frontend signs people out when /me fails, so it never refuses."""
    assert await _me(http, people["organiser"], headers) == (False, False)


async def test_me_reports_a_platform_admin_everywhere(shared, people, http):
    for headers in ({}, ALPHA, BRAVO):
        assert await _me(http, people["platform"], headers) == (True, True)


async def test_me_does_not_report_the_legacy_flag(shared, people, http):
    assert await _me(http, people["legacy"], ALPHA) == (False, False)


async def test_a_profile_update_reports_the_same(shared, people, http):
    as_user(people["organiser"])
    response = await http.patch(
        "/api/users/me", headers=ALPHA, json={"full_name": "Org"}
    )
    assert response.status_code == 200
    assert response.json()["is_admin"] is True

    response = await http.put("/api/users/me?full_name=Org", headers=BRAVO)
    assert response.status_code == 200
    assert response.json()["is_admin"] is False


# --- single tenancy: unchanged ---------------------------------------------------


async def test_single_mode_admin_is_the_global_flag(people, http):
    legacy = people["legacy"]
    for path in TOURNAMENT_ADMIN_ROUTES + [REGISTRY]:
        assert (await _get(http, legacy, path)).status_code == 200, path
    assert await _me(http, legacy) == (True, True)


async def test_single_mode_ignores_memberships_and_the_allowlist(people, http):
    """A legacy database has neither, so neither may grant anything there."""
    for name in ("organiser", "platform"):
        response = await _get(http, people[name], "/api/admin/contests", ALPHA)
        assert response.status_code == 403, name
        assert (await _get(http, people[name], REGISTRY)).status_code == 403, name


# --- every admin route is guarded ------------------------------------------------


def _guards(route: APIRoute) -> set:
    guards = {get_tournament_admin, get_platform_admin}
    found, stack = set(), list(route.dependant.dependencies)
    while stack:
        dependency = stack.pop()
        if dependency.call in guards:
            found.add(dependency.call)
        stack.extend(dependency.dependencies)
    return found


def test_every_admin_route_has_exactly_one_guard():
    from main import app

    admin_routes = [
        r
        for r in app.routes
        if isinstance(r, APIRoute) and r.path.startswith("/api/admin")
    ]
    assert admin_routes

    for route in admin_routes:
        expected = (
            get_platform_admin
            if route.path.startswith(PLATFORM_ADMIN_PREFIXES)
            else get_tournament_admin
        )
        assert _guards(route) == {expected}, (route.methods, route.path)


# --- the user list an admin edits teams from -------------------------------------


async def test_the_team_owner_list_is_this_tournaments(shared, people, http):
    """Paged over people with a team here, not over every account."""
    alpha, bravo = people["alpha"], people["bravo"]
    for owner, tournament in (
        (people["player"], alpha),
        (people["player"], alpha),
        (people["legacy"], bravo),
    ):
        await Team(
            tournament_id=tournament.id, user_id=owner.id, team_name=owner.username
        ).insert()

    response = await _get(
        http, people["platform"], "/api/admin/users-with-teams?page_size=1", ALPHA
    )
    body = response.json()

    assert body["total"] == 1
    assert [(u["username"], u["team_count"]) for u in body["users"]] == [("player", 2)]


async def test_a_search_only_finds_this_tournaments_team_owners(shared, people, http):
    await Team(
        tournament_id=people["bravo"].id,
        user_id=people["legacy"].id,
        team_name="legacy",
    ).insert()

    response = await _get(
        http,
        people["platform"],
        "/api/admin/users-with-teams?search=leg",
        ALPHA,
    )

    assert response.json()["users"] == []
    assert response.json()["total"] == 0
