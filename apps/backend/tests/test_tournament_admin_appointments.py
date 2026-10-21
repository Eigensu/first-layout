"""Appointing and removing a tournament's admins (spec §4.7).

Under shared tenancy, admin is a role on one tournament's membership. Before
these routes, nothing in the product could set it: a tournament created after
cutover would have no admin until someone edited the database by hand.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.common.enums.tournaments import TournamentStatus
from app.models.admin.audit_log import AdminActionLog
from app.models.tournament import Tournament
from app.models.tournament_membership import (
    ROLE_ADMIN,
    ROLE_PLAYER,
    STATUS_PLAYED,
    TournamentMembership,
)
from app.models.user import User
from app.utils.dependencies import get_current_active_user
from app.utils.tenant import TENANT_HEADER
from config.settings import settings

ALPHA = {TENANT_HEADER: "alpha"}
# A route only an admin of the tournament named in the header may open.
ADMIN_PAGE = "/api/admin/settings"


@pytest.fixture
def shared(monkeypatch):
    monkeypatch.setattr(settings, "tenancy", "shared")


async def _user(name: str, **fields) -> User:
    fields.setdefault("email", f"{name}@example.com")
    user = User(
        username=name,
        hashed_password="not-a-real-hash",
        is_active=True,
        is_verified=True,
        **fields,
    )
    await user.insert()
    return user


@pytest_asyncio.fixture
async def world(db):
    alpha = Tournament(slug="alpha", name="Alpha", status=TournamentStatus.LIVE)
    await alpha.insert()
    platform = await _user("platform", is_platform_admin=True)
    asha = await _user("asha", mobile="9876543210", mobiles=["9876543210"])
    return {"alpha": alpha, "platform": platform, "asha": asha}


@pytest_asyncio.fixture
async def http(db):
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


def _admins(world) -> str:
    return f"/api/admin/tournaments/{world['alpha'].id}/admins"


async def _appoint(http, world, identifier, by=None):
    as_user(by or world["platform"])
    return await http.post(_admins(world), json={"identifier": identifier})


async def _membership(user, tournament):
    return await TournamentMembership.find_one(
        TournamentMembership.user_id == user.id,
        TournamentMembership.tournament_id == tournament.id,
    )


async def _logged(action):
    return await AdminActionLog.find(AdminActionLog.action == action).to_list()


# --- appointing -------------------------------------------------------------------


async def test_an_appointed_admin_can_run_the_tournament(shared, world, http):
    as_user(world["asha"])
    assert (await http.get(ADMIN_PAGE, headers=ALPHA)).status_code == 403

    response = await _appoint(http, world, "+91 98765 43210")

    assert response.status_code == 200, response.text
    assert response.json()["username"] == "asha"
    as_user(world["asha"])
    assert (await http.get(ADMIN_PAGE, headers=ALPHA)).status_code == 200


async def test_someone_new_to_the_tournament_gets_a_membership(shared, world, http):
    await _appoint(http, world, "asha@example.com")

    membership = await _membership(world["asha"], world["alpha"])
    assert membership.role == ROLE_ADMIN
    assert membership.tournament_slug == "alpha"
    assert membership.display_name == "asha"


async def test_a_player_keeps_their_record_when_promoted(shared, world, http):
    await TournamentMembership(
        user_id=world["asha"].id,
        tournament_id=world["alpha"].id,
        tournament_slug="alpha",
        display_name="asha_plays",
        status=STATUS_PLAYED,
    ).insert()

    response = await _appoint(http, world, "asha")

    membership = await _membership(world["asha"], world["alpha"])
    assert membership.role == ROLE_ADMIN
    assert membership.status == STATUS_PLAYED
    assert response.json()["display_name"] == "asha_plays"
    assert await TournamentMembership.find_all().count() == 1


async def test_signing_in_while_being_appointed(shared, world, http, monkeypatch):
    """Their sign-in creates the row between our lookup and our insert."""
    from app.routes.admin import tournaments as routes

    await TournamentMembership(
        user_id=world["asha"].id,
        tournament_id=world["alpha"].id,
        tournament_slug="alpha",
        display_name="asha",
    ).insert()
    real = routes._membership_of
    lookups = []

    async def _not_yet_then_there(user_id, tournament):
        lookups.append(user_id)
        return None if len(lookups) == 1 else await real(user_id, tournament)

    monkeypatch.setattr(routes, "_membership_of", _not_yet_then_there)

    response = await _appoint(http, world, "asha")

    assert response.status_code == 200, response.text
    assert (await _membership(world["asha"], world["alpha"])).role == ROLE_ADMIN
    assert await TournamentMembership.find_all().count() == 1
    assert len(await _logged("tournament_admin.appoint")) == 1


@pytest.mark.parametrize("starting_role", [ROLE_PLAYER, ROLE_ADMIN])
async def test_changing_the_role_keeps_play_that_landed_meanwhile(
    shared, world, http, monkeypatch, starting_role
):
    """They make a team between our read of their row and our write to it.

    Writing the whole row back would put them back to registered and drop the
    activity; only the role may change (Greptile on #56).
    """
    from app.routes.admin import tournaments as routes
    from app.services.membership import record_play

    asha, alpha = world["asha"], world["alpha"]
    await TournamentMembership(
        user_id=asha.id,
        tournament_id=alpha.id,
        tournament_slug="alpha",
        display_name="asha",
        role=starting_role,
    ).insert()
    stale = await _membership(asha, alpha)
    await record_play(asha, alpha.id)

    async def _as_first_read(user_id, tournament):
        return stale

    monkeypatch.setattr(routes, "_membership_of", _as_first_read)
    as_user(world["platform"])
    if starting_role == ROLE_PLAYER:
        response = await http.post(_admins(world), json={"identifier": "asha"})
    else:
        response = await http.delete(f"{_admins(world)}/{asha.id}")

    assert response.status_code == 200, response.text
    fresh = await _membership(asha, alpha)
    assert fresh.role == (ROLE_ADMIN if starting_role == ROLE_PLAYER else ROLE_PLAYER)
    assert fresh.status == STATUS_PLAYED
    assert fresh.last_active_at is not None


async def test_appointing_is_logged_once(shared, world, http):
    await _appoint(http, world, "asha")
    again = await _appoint(http, world, "asha")

    assert again.status_code == 200
    logged = await _logged("tournament_admin.appoint")
    assert len(logged) == 1
    assert logged[0].admin_id == str(world["platform"].id)
    assert logged[0].target_id == str(world["asha"].id)
    assert logged[0].tournament_id == world["alpha"].id


async def test_an_ambiguous_username_asks_for_mobile_or_email(shared, world, http):
    await _user("asha", email="other-asha@example.com")

    response = await _appoint(http, world, "asha")

    assert response.status_code == 409
    assert "mobile number or email" in response.json()["detail"]
    assert await TournamentMembership.find_all().count() == 0


async def test_nobody_by_that_identifier(shared, world, http):
    response = await _appoint(http, world, "nobody@example.com")

    assert response.status_code == 404


async def test_a_disabled_account_cannot_be_appointed(shared, world, http):
    world["asha"].is_active = False
    await world["asha"].save()

    response = await _appoint(http, world, "asha")

    assert response.status_code == 400
    assert await TournamentMembership.find_all().count() == 0


# --- listing and removing ---------------------------------------------------------


async def test_lists_only_this_tournaments_admins(shared, world, http):
    bravo = Tournament(slug="bravo", name="Bravo", status=TournamentStatus.LIVE)
    await bravo.insert()
    zara = await _user("zara")
    player = await _user("player")
    for user, tournament, role in (
        (zara, world["alpha"], ROLE_ADMIN),
        (player, world["alpha"], ROLE_PLAYER),
        (world["asha"], bravo, ROLE_ADMIN),
    ):
        await TournamentMembership(
            user_id=user.id,
            tournament_id=tournament.id,
            tournament_slug=tournament.slug,
            display_name=user.username,
            role=role,
        ).insert()
    await _appoint(http, world, "asha")

    as_user(world["platform"])
    response = await http.get(_admins(world))

    assert response.status_code == 200
    names = [a["username"] for a in response.json()["admins"]]
    assert names == ["asha", "zara"]


async def test_a_removed_admin_stays_a_member_without_admin(shared, world, http):
    await _appoint(http, world, "asha")

    as_user(world["platform"])
    response = await http.delete(f"{_admins(world)}/{world['asha'].id}")

    assert response.status_code == 200
    membership = await _membership(world["asha"], world["alpha"])
    assert membership.role == ROLE_PLAYER
    assert len(await _logged("tournament_admin.remove")) == 1
    as_user(world["asha"])
    assert (await http.get(ADMIN_PAGE, headers=ALPHA)).status_code == 403


async def test_removing_someone_who_is_not_an_admin(shared, world, http):
    as_user(world["platform"])

    assert (await http.delete(f"{_admins(world)}/{world['asha'].id}")).status_code == 404
    assert (await http.delete(f"{_admins(world)}/not-an-id")).status_code == 400


# --- who may do this, and where ---------------------------------------------------


async def test_only_platform_admins_appoint(shared, world, http):
    """A tournament admin cannot make more admins, of theirs or anyone's."""
    await _appoint(http, world, "asha")
    await _user("friend", email="friend@example.com")

    response = await _appoint(http, world, "friend@example.com", by=world["asha"])

    assert response.status_code == 403
    as_user(world["asha"])
    assert (await http.get(_admins(world))).status_code == 403


async def test_an_unknown_tournament(shared, world, http):
    as_user(world["platform"])
    response = await http.post(
        "/api/admin/tournaments/64b7f0000000000000000000/admins",
        json={"identifier": "asha"},
    )

    assert response.status_code == 404


async def test_a_single_tournament_service_says_to_use_is_admin(world, http):
    platform_there = await _user("legacy-admin", is_admin=True)

    response = await _appoint(http, world, "asha", by=platform_there)

    assert response.status_code == 409
    assert "is_admin" in response.json()["detail"]
    assert await TournamentMembership.find_all().count() == 0
