"""TENANCY=shared: one backend, one database, two tournaments that never meet.

Every document below belongs to "alpha" or "bravo" and carries that word in
its name, so a response that leaks one tournament into the other says so in
plain text. Requests name their tournament the way the frontend does, in
X-Tournament-Slug.
"""

from datetime import timedelta
from types import SimpleNamespace

import pytest
import pytest_asyncio
from beanie import PydanticObjectId
from httpx import ASGITransport, AsyncClient

from app.common.enums.tournaments import TournamentStatus
from app.models.admin.audit_log import AdminActionLog
from app.models.admin.import_log import ImportLog
from app.models.admin.player import Player as AdminPlayer
from app.models.admin.slot import Slot
from app.models.carousel import CarouselImage
from app.models.contest import Contest
from app.models.player_contest_points import PlayerContestPoints
from app.models.settings import PLATFORM_DEFAULTS_ID, GlobalSettings
from app.models.sponsor import Sponsor, SponsorTier
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.tournament import Tournament
from app.models.user import User
from app.utils.dependencies import get_current_active_user
from app.utils.tenant import TENANT_HEADER, TENANT_MODELS
from app.utils.timezone import now_ist
from config.settings import settings

ALPHA = {TENANT_HEADER: "alpha"}
BRAVO = {TENANT_HEADER: "bravo"}


@pytest.fixture
def shared(monkeypatch):
    monkeypatch.setattr(settings, "tenancy", "shared")


@pytest_asyncio.fixture
async def player(db):
    """One person who plays in both tournaments."""
    user = User(
        username="player",
        email="player@example.com",
        hashed_password="not-a-real-hash",
        is_active=True,
        is_verified=True,
    )
    await user.insert()
    return user


@pytest_asyncio.fixture
async def user_client(player):
    from main import app

    async def _player():
        return player

    app.dependency_overrides[get_current_active_user] = _player
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_current_active_user, None)


async def _seed(
    slug: str, user: User, admin: User, sponsor_priorities
) -> SimpleNamespace:
    t = Tournament(slug=slug, name=slug.title(), status=TournamentStatus.LIVE)
    await t.insert()
    tid = t.id
    start = now_ist() + timedelta(days=1)

    slot = Slot(
        tournament_id=tid,
        code="BAT",
        name=f"{slug} batters",
        min_select=2,
        max_select=2,
    )
    await slot.insert()
    star = AdminPlayer(
        tournament_id=tid,
        name=f"{slug} star",
        team=f"{slug} XI",
        price=100,
        slot=str(slot.id),
    )
    keeper = AdminPlayer(
        tournament_id=tid,
        name=f"{slug} keeper",
        team=f"{slug} XI",
        price=100,
        slot=str(slot.id),
    )
    for p in (star, keeper):
        await p.insert()

    # Both tournaments run a contest called FINAL: codes are per tournament.
    final = Contest(
        tournament_id=tid,
        code="FINAL",
        name=f"{slug} final",
        start_at=start,
        end_at=start + timedelta(days=1),
    )
    semi = Contest(
        tournament_id=tid,
        code="SEMI",
        name=f"{slug} semi",
        start_at=start,
        end_at=start + timedelta(days=1),
    )
    for c in (final, semi):
        await c.insert()

    team = Team(
        tournament_id=tid,
        user_id=user.id,
        team_name=f"{slug} team",
        player_ids=[str(star.id), str(keeper.id)],
        captain_id=str(star.id),
        vice_captain_id=str(keeper.id),
        contest_id=str(final.id),
    )
    await team.insert()
    enrollment = TeamContestEnrollment(
        tournament_id=tid, team_id=team.id, user_id=user.id, contest_id=final.id
    )
    await enrollment.insert()
    points = PlayerContestPoints(
        tournament_id=tid, contest_id=final.id, player_id=star.id, points=10
    )
    await points.insert()

    sponsors = []
    for priority in sponsor_priorities:
        s = Sponsor(
            tournament_id=tid,
            name=f"{slug} sponsor {priority}",
            tier=SponsorTier.GOLD,
            logo="https://example.com/logo.png",
            description=f"{slug} sponsor",
            priority=priority,
        )
        await s.insert()
        sponsors.append(s)
    slide = CarouselImage(tournament_id=tid, title=f"{slug} slide", display_order=4)
    await slide.insert()
    log = ImportLog(
        tournament_id=tid,
        user_id=str(admin.id),
        filename=f"{slug}.csv",
        file_size=1,
        checksum="x",
        format="csv",
        conflict_policy="skip",
        slot_strategy="lookup",
    )
    await log.insert()

    docs = [
        slot,
        star,
        keeper,
        final,
        semi,
        team,
        enrollment,
        points,
        *sponsors,
        slide,
        log,
    ]
    return SimpleNamespace(
        tournament=t,
        id=tid,
        slot=slot,
        star=star,
        keeper=keeper,
        final=final,
        semi=semi,
        team=team,
        enrollment=enrollment,
        points=points,
        sponsor=sponsors[0],
        slide=slide,
        log=log,
        markers={slug} | {str(d.id) for d in docs},
    )


@pytest_asyncio.fixture
async def world(db, shared, player, admin_user):
    await admin_user.insert()
    alpha = await _seed("alpha", player, admin_user, sponsor_priorities=[1])
    bravo = await _seed("bravo", player, admin_user, sponsor_priorities=[1, 2, 3])
    await Tournament(
        slug="gone", name="Gone", status=TournamentStatus.ARCHIVED
    ).insert()
    # Written before the backfill: belongs to no tournament on this backend.
    start = now_ist() + timedelta(days=1)
    await Contest(
        code="LEGACY",
        name="untagged legacy",
        start_at=start,
        end_at=start + timedelta(days=1),
    ).insert()
    return SimpleNamespace(alpha=alpha, bravo=bravo)


def _text(value) -> str:
    """Every string in a JSON body, joined, so a leak shows up as a substring."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(_text(v) for v in value.values())
    if isinstance(value, list):
        return " ".join(_text(v) for v in value)
    return ""


async def _snapshot(t) -> dict:
    """Every document a tournament owns, by collection."""
    seen, out = set(), {}
    for model in TENANT_MODELS:
        coll = model.get_motor_collection()
        if coll.name in seen:
            continue
        seen.add(coll.name)
        out[coll.name] = sorted(
            [d async for d in coll.find({"tournament_id": t.id})],
            key=lambda d: str(d["_id"]),
        )
    return out


# --- which tournament ---------------------------------------------------------


async def test_a_tenant_request_without_a_tournament_is_refused(world, user_client):
    response = await user_client.get("/api/contests")
    assert response.status_code == 400
    assert TENANT_HEADER in response.json()["detail"]


@pytest.mark.parametrize("slug", ["nowhere", "gone"])
async def test_an_unknown_or_archived_tournament_is_refused(world, user_client, slug):
    response = await user_client.get("/api/contests", headers={TENANT_HEADER: slug})
    assert response.status_code == 400
    assert response.json()["detail"] == "Unknown tournament"


async def test_the_slug_is_read_the_way_a_host_is_written(world, user_client):
    response = await user_client.get(
        "/api/contests", headers={TENANT_HEADER: " Alpha "}
    )
    assert response.status_code == 200
    assert {c["name"] for c in response.json()["contests"]} == {
        "alpha final",
        "alpha semi",
    }


async def test_global_routes_need_no_tournament(world, user_client):
    assert (await user_client.get("/api/tournaments")).status_code == 200


async def test_untagged_documents_belong_to_no_tournament(world, user_client):
    for headers in (ALPHA, BRAVO):
        response = await user_client.get("/api/contests", headers=headers)
        assert "LEGACY" not in {c["code"] for c in response.json()["contests"]}


async def test_single_mode_ignores_the_header(world, user_client, monkeypatch):
    """A legacy service: untagged data is all of it, and nothing else shows."""
    monkeypatch.setattr(settings, "tenancy", "single")

    response = await user_client.get("/api/contests", headers=BRAVO)

    assert response.status_code == 200
    assert [c["code"] for c in response.json()["contests"]] == ["LEGACY"]


# --- reads see one tournament -------------------------------------------------

PUBLIC_READS = [
    "/api/contests",
    "/api/contests/enrollments/me",
    "/api/contests/{final}/leaderboard",
    "/api/players",
    # GET /api/players/hot itself is shadowed by /api/players/{id} (router
    # order in main.py), so its aggregation is tested directly below.
    "/api/players/hot/ids?threshold=1",
    "/api/slots",
    "/api/v1/sponsors/",
    "/api/v1/carousel/",
    "/api/leaderboard",
    "/api/teams/",
]
ADMIN_READS = [
    "/api/admin/contests",
    "/api/admin/players",
    "/api/admin/slots",
    "/api/admin/slots/{slot}/players",
    "/api/admin/users/{user}/teams",
    "/api/admin/players/import/logs",
    "/api/admin/contests/{final}/player-points",
]


def _fill(path: str, side, user) -> str:
    return path.format(final=side.final.id, slot=side.slot.id, user=user.id)


@pytest.mark.parametrize("path", PUBLIC_READS + ADMIN_READS)
@pytest.mark.parametrize("mine, theirs", [("alpha", "bravo"), ("bravo", "alpha")])
async def test_a_read_sees_only_its_tournament(
    world, client, user_client, player, path, mine, theirs
):
    own, other = getattr(world, mine), getattr(world, theirs)
    http = client if path.startswith("/api/admin") else user_client

    response = await http.get(_fill(path, own, player), headers={TENANT_HEADER: mine})

    assert response.status_code == 200, response.text
    body = _text(response.json())
    assert any(m in body for m in own.markers), body
    leaked = sorted(m for m in other.markers if m in body)
    assert leaked == [], body


async def test_hot_player_counts_are_per_tournament(world):
    from app.services import hot_players

    a = world.alpha
    everywhere = await hot_players.aggregate_hot_global(tournament_id=a.id)
    in_contest = await hot_players.aggregate_hot_in_contest(
        str(a.final.id), tournament_id=a.id
    )
    elsewhere = await hot_players.aggregate_hot_in_contest(
        str(world.bravo.final.id), tournament_id=a.id
    )

    picked = {str(a.star.id), str(a.keeper.id)}
    assert {r["_id"] for r in everywhere} == picked
    assert {r["_id"] for r in in_contest} == picked
    assert elsewhere == []


async def test_counts_are_per_tournament(world, client):
    response = await client.get("/api/admin/users-with-teams", headers=ALPHA)
    assert [u["team_count"] for u in response.json()["users"]] == [1]


# --- another tournament's ids do not resolve -----------------------------------


def _cross_tenant_requests(w):
    a, b = w.alpha, w.bravo
    return [
        # public, as the player who owns a team in both
        ("user", "GET", f"/api/contests/{b.final.id}", {}),
        ("user", "GET", f"/api/contests/{b.final.id}/me", {}),
        ("user", "GET", f"/api/contests/{b.final.id}/leaderboard", {}),
        ("user", "GET", f"/api/contests/{a.final.id}/teams/{b.team.id}", {}),
        (
            "user",
            "POST",
            f"/api/contests/{b.semi.id}/enroll",
            {"json": {"team_id": str(a.team.id)}},
        ),
        (
            "user",
            "POST",
            f"/api/contests/{a.semi.id}/enroll",
            {"json": {"team_id": str(b.team.id)}},
        ),
        ("user", "GET", f"/api/players/{b.star.id}", {}),
        ("user", "GET", f"/api/players/{b.star.id}/hot", {}),
        ("user", "GET", f"/api/slots/{b.slot.id}", {}),
        ("user", "GET", f"/api/v1/sponsors/{b.sponsor.id}", {}),
        ("user", "GET", f"/api/teams/{b.team.id}", {}),
        (
            "user",
            "PUT",
            f"/api/teams/{b.team.id}",
            {"json": {"team_name": "alpha hijack"}},
        ),
        ("user", "PATCH", f"/api/teams/{b.team.id}/rename?team_name=hijack", {}),
        ("user", "DELETE", f"/api/teams/{b.team.id}", {}),
        # admin
        ("admin", "GET", f"/api/admin/contests/{b.final.id}", {}),
        (
            "admin",
            "PUT",
            f"/api/admin/contests/{b.final.id}",
            {"json": {"name": "hijack"}},
        ),
        ("admin", "DELETE", f"/api/admin/contests/{b.final.id}?force=true", {}),
        ("admin", "GET", f"/api/admin/contests/{b.final.id}/player-points", {}),
        (
            "admin",
            "PUT",
            f"/api/admin/contests/{b.final.id}/player-points",
            {"json": {"updates": [{"player_id": str(b.star.id), "points": 99}]}},
        ),
        (
            "admin",
            "POST",
            f"/api/admin/contests/{b.final.id}/enroll-teams",
            {"json": {"team_ids": [str(b.team.id)]}},
        ),
        (
            "admin",
            "POST",
            f"/api/admin/contests/{a.final.id}/enroll-teams",
            {"json": {"team_ids": [str(b.team.id)]}},
        ),
        ("admin", "GET", f"/api/admin/contests/{b.final.id}/leaderboard/export", {}),
        ("admin", "GET", f"/api/admin/players/{b.star.id}", {}),
        ("admin", "PUT", f"/api/admin/players/{b.star.id}", {"json": {"points": 99}}),
        ("admin", "DELETE", f"/api/admin/players/{b.star.id}?force=true", {}),
        ("admin", "GET", f"/api/admin/slots/{b.slot.id}", {}),
        ("admin", "PUT", f"/api/admin/slots/{b.slot.id}", {"json": {"name": "hijack"}}),
        ("admin", "DELETE", f"/api/admin/slots/{b.slot.id}?force=true", {}),
        ("admin", "GET", f"/api/admin/slots/{b.slot.id}/players", {}),
        (
            "admin",
            "PUT",
            f"/api/v1/sponsors/{b.sponsor.id}",
            {"json": {"name": "hijack"}},
        ),
        ("admin", "DELETE", f"/api/v1/sponsors/{b.sponsor.id}", {}),
        ("admin", "PATCH", f"/api/v1/sponsors/{b.sponsor.id}/toggle-active", {}),
        ("admin", "PATCH", f"/api/v1/sponsors/{b.sponsor.id}/toggle-featured", {}),
        ("admin", "GET", f"/api/v1/carousel/{b.slide.id}", {}),
        (
            "admin",
            "PUT",
            f"/api/v1/carousel/{b.slide.id}",
            {"json": {"title": "hijack"}},
        ),
        ("admin", "DELETE", f"/api/v1/carousel/{b.slide.id}", {}),
        ("admin", "PATCH", f"/api/v1/carousel/{b.slide.id}/toggle-active", {}),
    ]


CROSS_TENANT_COUNT = 37


async def test_every_cross_tenant_request_is_listed(world):
    assert len(_cross_tenant_requests(world)) == CROSS_TENANT_COUNT


@pytest.mark.parametrize("index", range(CROSS_TENANT_COUNT))
async def test_another_tournaments_id_is_not_found(world, client, user_client, index):
    who, method, url, kwargs = _cross_tenant_requests(world)[index]
    http = client if who == "admin" else user_client

    response = await http.request(method, url, headers=ALPHA, **kwargs)

    assert response.status_code == 404, (method, url, response.text)


async def test_bulk_requests_skip_another_tournaments_ids(world, client):
    a, b = world.alpha, world.bravo

    unenrolled = await client.request(
        "DELETE",
        f"/api/admin/contests/{a.final.id}/enrollments",
        headers=ALPHA,
        json={"enrollment_ids": [str(b.enrollment.id)], "team_ids": [str(b.team.id)]},
    )
    assigned = await client.post(
        f"/api/admin/slots/{a.slot.id}/players",
        headers=ALPHA,
        json={"player_ids": [str(b.star.id)]},
    )
    unassigned = await client.request(
        "DELETE",
        f"/api/admin/slots/{a.slot.id}/players",
        headers=ALPHA,
        json={"player_ids": [str(b.star.id)]},
    )
    reordered = await client.patch(
        "/api/v1/carousel/reorder",
        headers=ALPHA,
        json={"image_orders": [{"id": str(b.slide.id), "display_order": 0}]},
    )

    assert unenrolled.json() == {"unenrolled": 0}
    assert assigned.json() == {"assigned": 0}
    assert unassigned.json() == {"unassigned": 0}
    assert reordered.status_code == 200


async def test_nothing_alpha_does_reaches_bravo(world, client, user_client):
    """Every request above, then bravo's documents compared field by field."""
    before = await _snapshot(world.bravo)

    for who, method, url, kwargs in _cross_tenant_requests(world):
        http = client if who == "admin" else user_client
        await http.request(method, url, headers=ALPHA, **kwargs)
    await test_bulk_requests_skip_another_tournaments_ids(world, client)
    await client.delete(
        "/api/admin/players/bulk/all?confirm=DELETE_ALL_PLAYERS", headers=ALPHA
    )

    assert await _snapshot(world.bravo) == before


# --- writes land in the request's tournament -----------------------------------


async def test_delete_all_players_means_this_tournaments(world, client):
    response = await client.delete(
        "/api/admin/players/bulk/all?confirm=DELETE_ALL_PLAYERS", headers=ALPHA
    )

    assert response.json()["players_deleted"] == 2
    assert response.json()["teams_cleared"] == 1
    assert (
        await AdminPlayer.find(AdminPlayer.tournament_id == world.alpha.id).count() == 0
    )
    assert (
        await AdminPlayer.find(AdminPlayer.tournament_id == world.bravo.id).count() == 2
    )
    bravo_team = await Team.get(world.bravo.team.id)
    assert len(bravo_team.player_ids) == 2


async def test_contest_codes_are_per_tournament(world, client):
    start = now_ist() + timedelta(days=2)
    body = {
        "code": "QF",
        "name": "quarter final",
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(days=1)).isoformat(),
    }

    in_alpha = await client.post("/api/admin/contests", headers=ALPHA, json=body)
    in_bravo = await client.post("/api/admin/contests", headers=BRAVO, json=body)
    again = await client.post("/api/admin/contests", headers=ALPHA, json=body)

    assert in_alpha.status_code == in_bravo.status_code == 201
    assert again.status_code == 400
    assert (await Contest.get(in_alpha.json()["id"])).tournament_id == world.alpha.id
    assert (await Contest.get(in_bravo.json()["id"])).tournament_id == world.bravo.id


async def test_names_are_unique_per_tournament(world, client):
    """A player or slot name taken in bravo is free in alpha."""
    player = await client.post(
        "/api/admin/players",
        headers=ALPHA,
        json={"name": "bravo star", "team": "alpha XI"},
    )
    slot = await client.post(
        "/api/admin/slots",
        headers=ALPHA,
        json={
            "code": "BOWL",
            "name": "bravo batters",
            "min_select": 0,
            "max_select": 2,
        },
    )
    taken = await client.post(
        "/api/admin/slots",
        headers=ALPHA,
        json={"code": "BAT", "name": "another", "min_select": 0, "max_select": 2},
    )

    assert player.status_code == 201, player.text
    assert (await AdminPlayer.get(player.json()["id"])).tournament_id == world.alpha.id
    assert slot.status_code == 201, slot.text
    assert (await Slot.get(slot.json()["id"])).tournament_id == world.alpha.id
    assert taken.status_code == 400


async def test_sponsor_and_slide_ordering_is_per_tournament(world, client):
    sponsor = await client.post(
        "/api/v1/sponsors",
        headers=ALPHA,
        json={
            "name": "alpha new",
            "tier": "gold",
            "logo": "https://example.com/logo.png",
            "description": "new",
        },
    )
    slide = await client.post("/api/v1/carousel/", headers=ALPHA, json={"title": "new"})

    # bravo's sponsors run to priority 3 and its slide sits at 4; alpha's do not.
    assert sponsor.status_code == 201, sponsor.text
    assert sponsor.json()["sponsor"]["priority"] == 2
    assert (
        await Sponsor.get(sponsor.json()["sponsor"]["_id"])
    ).tournament_id == world.alpha.id
    assert slide.json()["display_order"] == 5
    assert (
        await CarouselImage.get(slide.json()["_id"])
    ).tournament_id == world.alpha.id

    gaps = await client.get(
        "/api/v1/sponsors/available-priorities?featured=false", headers=ALPHA
    )
    assert gaps.json()["used"] == [1, 2]


async def test_a_squad_is_built_from_its_own_tournament(world, user_client):
    a, b = world.alpha, world.bravo
    squad = {
        "team_name": "alpha second",
        "contest_id": str(a.semi.id),
        "player_ids": [str(a.star.id), str(a.keeper.id)],
        "captain_id": str(a.star.id),
        "vice_captain_id": str(a.keeper.id),
    }
    poached = squad | {
        "player_ids": [str(b.star.id), str(b.keeper.id)],
        "captain_id": str(b.star.id),
        "vice_captain_id": str(b.keeper.id),
    }

    created = await user_client.post("/api/teams/", headers=ALPHA, json=squad)
    refused = await user_client.post("/api/teams/", headers=ALPHA, json=poached)
    elsewhere = await user_client.post(
        "/api/teams/", headers=ALPHA, json=squad | {"contest_id": str(b.semi.id)}
    )

    assert created.status_code == 201, created.text
    assert (await Team.get(created.json()["id"])).tournament_id == a.id
    assert refused.status_code == 400
    assert refused.json()["detail"] == "Some player IDs are invalid"
    assert elsewhere.status_code == 400
    assert elsewhere.json()["detail"] == "Invalid contest_id"


async def test_an_admin_enrolls_and_unenrolls_within_the_tournament(world, client):
    a = world.alpha
    team = Team(
        tournament_id=a.id,
        user_id=PydanticObjectId(),
        team_name="alpha walk-in",
        player_ids=[str(a.star.id), str(a.keeper.id)],
    )
    await team.insert()

    enrolled = await client.post(
        f"/api/admin/contests/{a.semi.id}/enroll-teams",
        headers=ALPHA,
        json={"team_ids": [str(team.id)]},
    )
    assert enrolled.status_code == 200, enrolled.text
    [row] = enrolled.json()
    assert (await TeamContestEnrollment.get(row["id"])).tournament_id == a.id

    again = await client.post(
        f"/api/admin/contests/{a.semi.id}/enroll-teams",
        headers=ALPHA,
        json={"team_ids": [str(team.id)]},
    )
    assert again.json() == []

    removed = await client.request(
        "DELETE",
        f"/api/admin/contests/{a.semi.id}/enrollments",
        headers=ALPHA,
        json={"team_ids": [str(team.id)]},
    )
    assert removed.json() == {"unenrolled": 1}


async def test_an_enrollment_records_its_tournament(world, user_client):
    a = world.alpha
    response = await user_client.post(
        f"/api/contests/{a.semi.id}/enroll",
        headers=ALPHA,
        json={"team_id": str(a.team.id)},
    )

    assert response.status_code == 200, response.text
    enrollment = await TeamContestEnrollment.get(response.json()["id"])
    assert enrollment.tournament_id == a.id


async def test_points_and_audit_records_land_in_the_tournament(world, client):
    a = world.alpha
    await client.put(
        f"/api/admin/contests/{a.semi.id}/player-points",
        headers=ALPHA,
        json={"updates": [{"player_id": str(a.keeper.id), "points": 4}]},
    )
    await client.delete(f"/api/admin/players/{a.keeper.id}?force=true", headers=ALPHA)

    points = await PlayerContestPoints.find_one(
        PlayerContestPoints.contest_id == a.semi.id
    )
    assert points.tournament_id == a.id
    log = await AdminActionLog.find_one(AdminActionLog.target_id == str(a.keeper.id))
    assert log.tournament_id == a.id


async def test_an_import_lands_in_the_tournament(world, client):
    csv = "name,team,price,slot_code\nalpha new,alpha XI,50,BAT\n"
    response = await client.post(
        "/api/admin/players/import",
        headers=ALPHA,
        files={"file": ("players.csv", csv.encode(), "text/csv")},
        data={"dry_run": "false"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["created"] == 1
    imported = await AdminPlayer.find_one(AdminPlayer.name == "alpha new")
    assert imported.tournament_id == world.alpha.id
    # BAT resolves to alpha's slot, not bravo's of the same code.
    assert imported.slot == str(world.alpha.slot.id)
    assert await ImportLog.find(ImportLog.tournament_id == world.alpha.id).count() == 2


# --- settings ---------------------------------------------------------------


async def test_settings_are_per_tournament(world, client, user_client):
    updated = await client.put(
        "/api/admin/settings", headers=ALPHA, json={"max_players_per_team": 3}
    )

    assert updated.status_code == 200, updated.text
    own = await GlobalSettings.find_one(GlobalSettings.tournament_id == world.alpha.id)
    assert own.id == f"tournament:{world.alpha.id}"
    assert own.max_players_per_team == 3
    assert (await GlobalSettings.get(PLATFORM_DEFAULTS_ID)).max_players_per_team == 7

    alpha = await user_client.get("/api/settings", headers=ALPHA)
    bravo = await user_client.get("/api/settings", headers=BRAVO)
    assert alpha.json()["max_players_per_team"] == 3
    assert bravo.json()["max_players_per_team"] == 7

    contests = await user_client.get("/api/contests", headers=ALPHA)
    caps = {c["effective_max_players_per_team"] for c in contests.json()["contests"]}
    assert caps == {3}


async def test_a_second_edit_updates_the_same_row(world, client):
    await client.put(
        "/api/admin/settings", headers=ALPHA, json={"max_players_per_team": 3}
    )
    await client.put(
        "/api/admin/settings", headers=ALPHA, json={"min_players_per_team": 2}
    )

    rows = await GlobalSettings.find(
        GlobalSettings.tournament_id == world.alpha.id
    ).to_list()
    assert [(r.min_players_per_team, r.max_players_per_team) for r in rows] == [(2, 3)]


async def test_the_default_logo_url_names_the_tournament(world, user_client):
    await GlobalSettings(
        id=f"tournament:{world.alpha.id}",
        tournament_id=world.alpha.id,
        default_contest_logo_file_id="alpha-logo",
    ).insert()

    contests = await user_client.get("/api/contests", headers=ALPHA)

    logos = {c["logo_url"] for c in contests.json()["contests"]}
    assert logos == {f"/api/settings/logo?tournament_id={world.alpha.id}"}
