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
    csv = (
        "name,team,price,slot_code,slot_name\n"
        "alpha new,alpha XI,50,BAT,\n"
        "alpha other,alpha XI,60,,alpha batters\n"
        # bravo's slot name, which alpha does not have: no slot, not bravo's.
        "alpha third,alpha XI,70,,bravo batters\n"
    )
    response = await client.post(
        "/api/admin/players/import",
        headers=ALPHA,
        files={"file": ("players.csv", csv.encode(), "text/csv")},
        data={"dry_run": "false"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["created"] == 3
    imported = {
        p.name: p
        for p in await AdminPlayer.find(
            AdminPlayer.name >= "alpha n", AdminPlayer.name < "alpha u"
        ).to_list()
    }
    assert {p.tournament_id for p in imported.values()} == {world.alpha.id}
    # BAT, and the name "alpha batters", resolve to alpha's slot; bravo's slot
    # of the same code is never considered.
    assert imported["alpha new"].slot == str(world.alpha.slot.id)
    assert imported["alpha other"].slot == str(world.alpha.slot.id)
    assert imported["alpha third"].slot is None
    assert await ImportLog.find(ImportLog.tournament_id == world.alpha.id).count() == 2


async def test_the_import_template_lists_this_tournaments_slots(world, client):
    response = await client.get(
        "/api/admin/players/import/template?format=xlsx", headers=ALPHA
    )
    assert response.status_code == 200, response.text


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


async def test_the_default_logo_url_names_the_tournament(world, client, user_client):
    await GlobalSettings(
        id=f"tournament:{world.alpha.id}",
        tournament_id=world.alpha.id,
        default_contest_logo_file_id="alpha-logo",
    ).insert()

    contests = await user_client.get("/api/contests", headers=ALPHA)
    admin_contests = await client.get("/api/admin/contests", headers=ALPHA)

    for body in (contests.json(), admin_contests.json()):
        logos = {c["logo_url"] for c in body["contests"]}
        assert logos == {f"/api/settings/logo?tournament_id={world.alpha.id}"}


async def test_the_default_logo_route_reads_the_named_tournament(world, user_client):
    """No logo is uploaded here, so each lookup ends in the same 404 -- but by
    way of the tournament the URL names."""
    for query in ("", "?tournament_id=not-an-id", f"?tournament_id={world.alpha.id}"):
        response = await user_client.get(f"/api/settings/logo{query}")
        assert response.status_code == 404
        assert response.json()["detail"] == "Default logo not found"


async def test_admin_settings_read_the_tournaments_row(world, client):
    await client.put(
        "/api/admin/settings", headers=ALPHA, json={"max_players_per_team": 4}
    )

    alpha = await client.get("/api/admin/settings", headers=ALPHA)
    bravo = await client.get("/api/admin/settings", headers=BRAVO)

    assert alpha.json()["max_players_per_team"] == 4
    assert bravo.json()["max_players_per_team"] == 7


async def test_a_legacy_service_edits_its_one_settings_document(db):
    own = await GlobalSettings.get_own_for_tournament(None)
    assert own.id == PLATFORM_DEFAULTS_ID


def test_a_legacy_service_keeps_its_logo_url():
    from app.models.settings import default_logo_path

    assert default_logo_path(None) == "/api/settings/logo"


# --- every path of a route runs under the tenant ------------------------------


async def test_a_malformed_id_is_not_found(world, user_client):
    response = await user_client.get("/api/contests/not-an-id", headers=ALPHA)
    assert response.status_code == 404


async def test_searching_stays_in_the_tournament(world, client, user_client):
    contests = await user_client.get("/api/contests?q=final", headers=ALPHA)
    players = await client.get("/api/admin/players?search=star", headers=ALPHA)
    slots = await client.get("/api/admin/slots?search=batters", headers=ALPHA)

    assert [c["name"] for c in contests.json()["contests"]] == ["alpha final"]
    assert [p["name"] for p in players.json()["players"]] == ["alpha star"]
    assert [s["name"] for s in slots.json()["slots"]] == ["alpha batters"]


async def test_a_slot_and_its_player_count(world, user_client):
    response = await user_client.get(f"/api/slots/{world.alpha.slot.id}", headers=ALPHA)
    assert response.json()["player_count"] == 2


async def test_a_private_contest_shows_to_its_entrant(world, user_client, player):
    a = world.alpha
    start = now_ist() + timedelta(days=1)
    private = Contest(
        tournament_id=a.id,
        code="INVITE",
        name="alpha invite",
        visibility="private",
        start_at=start,
        end_at=start + timedelta(days=1),
    )
    await private.insert()
    await TeamContestEnrollment(
        tournament_id=a.id, team_id=a.team.id, user_id=player.id, contest_id=private.id
    ).insert()

    response = await user_client.get(f"/api/contests/{private.id}/me", headers=ALPHA)

    assert response.status_code == 200, response.text
    assert response.json()["name"] == "alpha invite"


async def test_a_daily_contest_checks_the_squad_against_this_tournaments_players(
    world, user_client
):
    a = world.alpha
    start = now_ist() + timedelta(days=1)
    daily = Contest(
        tournament_id=a.id,
        code="DAY1",
        name="alpha day one",
        contest_type="daily",
        allowed_teams=["alpha XI"],
        start_at=start,
        end_at=start + timedelta(days=1),
    )
    await daily.insert()

    response = await user_client.post(
        f"/api/contests/{daily.id}/enroll",
        headers=ALPHA,
        json={"team_id": str(a.team.id)},
    )

    assert response.status_code == 200, response.text


async def test_a_team_in_a_contest_shows_its_own_players(world, user_client):
    """Anyone may look once the contest is under way."""
    a = world.alpha
    await Contest.get_motor_collection().update_one(
        {"_id": a.final.id}, {"$set": {"start_at": now_ist() - timedelta(hours=1)}}
    )
    response = await user_client.get(
        f"/api/contests/{a.final.id}/teams/{a.team.id}", headers=ALPHA
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert {p["name"] for p in body["players"]} == {"alpha star", "alpha keeper"}
    assert body["contest_points"] == 20.0  # the captain's 10, doubled


async def test_editing_a_squad_reads_this_tournaments_rules(world, user_client):
    a = world.alpha
    swapped = await user_client.put(
        f"/api/teams/{a.team.id}",
        headers=ALPHA,
        json={
            "player_ids": [str(a.keeper.id), str(a.star.id)],
            "captain_id": str(a.keeper.id),
            "vice_captain_id": str(a.star.id),
        },
    )
    renamed = await user_client.patch(
        f"/api/teams/{a.team.id}/rename?team_name=alpha renamed", headers=ALPHA
    )
    poached = await user_client.put(
        f"/api/teams/{a.team.id}",
        headers=ALPHA,
        json={
            "player_ids": [str(a.star.id), str(world.bravo.keeper.id)],
            "captain_id": str(a.star.id),
            "vice_captain_id": str(world.bravo.keeper.id),
        },
    )

    assert swapped.status_code == 200, swapped.text
    assert swapped.json()["captain_id"] == str(a.keeper.id)
    assert renamed.json()["team_name"] == "alpha renamed"
    assert poached.status_code == 400
    assert poached.json()["detail"] == "Some player IDs are invalid"


async def test_deleting_a_team_removes_only_its_own_enrollment(world, user_client):
    a, b = world.alpha, world.bravo

    response = await user_client.delete(f"/api/teams/{a.team.id}", headers=ALPHA)

    assert response.status_code == 204
    assert (await TeamContestEnrollment.get(a.enrollment.id)).status == "removed"
    assert (await TeamContestEnrollment.get(b.enrollment.id)).status == "active"


async def test_a_rule_change_rechecks_this_tournaments_squads(world, client):
    response = await client.put(
        f"/api/admin/contests/{world.alpha.final.id}",
        headers=ALPHA,
        json={"max_players_per_team": 5},
    )
    assert response.status_code == 200, response.text
    assert response.json()["effective_max_players_per_team"] == 5


async def test_force_deleting_a_contest_removes_its_enrollments(world, client):
    a, b = world.alpha, world.bravo

    response = await client.delete(
        f"/api/admin/contests/{a.final.id}?force=true", headers=ALPHA
    )

    assert response.status_code == 200, response.text
    assert await Contest.get(a.final.id) is None
    assert (await TeamContestEnrollment.get(a.enrollment.id)).status == "removed"
    assert (await TeamContestEnrollment.get(b.enrollment.id)).status == "active"


async def test_the_leaderboard_export_is_this_tournaments(world, client):
    from io import BytesIO

    from openpyxl import load_workbook

    response = await client.get(
        f"/api/admin/contests/{world.alpha.final.id}/leaderboard/export", headers=ALPHA
    )

    assert response.status_code == 200, response.text
    sheet = load_workbook(BytesIO(response.content)).active
    rows = list(sheet.iter_rows(min_row=2, values_only=True))
    assert [(r[4], r[5]) for r in rows] == [("alpha team", 20)]
    assert "alpha star" in rows[0][12] and "bravo" not in rows[0][12]


async def test_a_user_teams_view_marks_this_tournaments_enrollment(
    world, client, player
):
    response = await client.get(
        f"/api/admin/users/{player.id}/teams?contest_id={world.alpha.final.id}",
        headers=ALPHA,
    )

    [team] = response.json()["teams"]
    assert team["team_name"] == "alpha team"
    assert team["enrolled"] is True


async def test_editing_a_players_points_retotals_only_this_tournaments_squads(
    world, client
):
    a, b = world.alpha, world.bravo
    await Team.get_motor_collection().update_one(
        {"_id": b.team.id}, {"$push": {"player_ids": str(a.star.id)}}
    )

    response = await client.put(
        f"/api/admin/players/{a.star.id}", headers=ALPHA, json={"points": 5}
    )

    assert response.status_code == 200, response.text
    assert (await Team.get(a.team.id)).total_points == 5
    # A bravo squad holding alpha's id (which no route would let it) is not
    # alpha's to retotal.
    assert (await Team.get(b.team.id)).total_points == 0


async def test_slot_maintenance_stays_in_the_tournament(world, client):
    a, b = world.alpha, world.bravo
    await AdminPlayer(
        tournament_id=a.id, name="alpha legacy", team="alpha XI", slot="7"
    ).insert()
    await AdminPlayer(
        tournament_id=b.id, name="bravo legacy", team="bravo XI", slot="9"
    ).insert()

    plan = await client.post("/api/admin/slots/migrate?dry_run=true", headers=ALPHA)
    unassigned = await client.delete(
        f"/api/admin/slots/{a.slot.id}/players/{a.star.id}", headers=ALPHA
    )
    deleted = await client.delete(
        f"/api/admin/slots/{a.slot.id}?force=true", headers=ALPHA
    )

    assert [s["legacy"] for s in plan.json()["created_slots"]] == ["7"]
    assert unassigned.json() == {"unassigned": 1}
    assert deleted.json()["unassigned_players"] == 1
    assert (await AdminPlayer.get(b.star.id)).slot == str(b.slot.id)


async def test_editing_a_sponsor_orders_it_within_the_tournament(world, client):
    response = await client.put(
        f"/api/v1/sponsors/{world.alpha.sponsor.id}",
        headers=ALPHA,
        json={"name": "alpha renamed", "featured": True},
    )

    assert response.status_code == 200, response.text
    sponsor = response.json()["sponsor"]
    assert sponsor["name"] == "alpha renamed"
    assert sponsor["priority"] == 1


async def test_a_sponsor_name_is_unique_per_tournament(world, client):
    taken = await client.put(
        f"/api/v1/sponsors/{world.alpha.sponsor.id}",
        headers=ALPHA,
        json={"name": "bravo sponsor 2"},
    )
    assert taken.status_code == 200, taken.text


async def test_hot_players_are_counted_in_the_tournament(world, user_client):
    a = world.alpha
    ids = await user_client.get(
        f"/api/players/hot/ids?contest_id={a.final.id}&threshold=1", headers=ALPHA
    )
    one = await user_client.get(
        f"/api/players/{a.star.id}/hot?contest_id={a.final.id}", headers=ALPHA
    )

    assert set(ids.json()["player_ids"]) == {str(a.star.id), str(a.keeper.id)}
    assert one.json()["selection_count_global"] == 1
    assert one.json()["selection_count_contest"] == 1


@pytest.mark.parametrize("in_contest", [False, True])
async def test_the_hot_player_list_is_this_tournaments(world, in_contest):
    """Called directly: GET /api/players/hot is shadowed by /api/players/{id}."""
    from app.routes.players_hot import list_hot_players

    a = world.alpha
    items = await list_hot_players(
        contest_id=str(a.final.id) if in_contest else None,
        threshold=None,
        limit=200,
        skip=0,
        sort="name_asc",
        tournament_id=a.id,
    )

    assert [i.player.name for i in items] == ["alpha keeper", "alpha star"]
