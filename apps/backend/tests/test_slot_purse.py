"""slot_purse contests: slot rules for the squad's shape, plus one purse for the
whole squad.

Each half is already covered on its own (slot rules in
test_auction_team_routes.py, the purse in the auction tests); these check
that a slot_purse contest applies both at once, in every path that touches a
squad: team create/update, the player pool, and the admin contest gate.
"""

from datetime import timedelta

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.common.datetime_utils import utc_now
from app.common.enums.contests import ContestFormat
from app.models.admin.slot import Slot
from app.models.contest import Contest
from app.models.player import Player
from app.models.settings import GlobalSettings
from app.models.user import User
from app.utils.dependencies import get_current_active_user


@pytest_asyncio.fixture
async def user_client(db):
    from main import app

    u = User(
        username="slot-purse-user",
        email="slotpurse@example.com",
        hashed_password="not-a-real-hash",
        is_active=True,
        is_verified=True,
    )
    await u.insert()

    async def _fake_user():
        return u

    app.dependency_overrides[get_current_active_user] = _fake_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_current_active_user, None)


async def _slots():
    """Two slots, each needing exactly two players."""
    bat = Slot(code="BAT", name="Batters", min_select=2, max_select=2)
    bowl = Slot(code="BOWL", name="Bowlers", min_select=2, max_select=2)
    await bat.insert()
    await bowl.insert()
    return bat, bowl


async def _contest(**overrides) -> Contest:
    start = utc_now() + timedelta(days=1)
    fields = {
        "code": "sp1",
        "name": "Slot Purse",
        "start_at": start,
        "end_at": start + timedelta(days=7),
        "contest_format": ContestFormat.SLOT_PURSE,
        "purse": 400,
    }
    fields.update(overrides)
    contest = Contest(**fields)
    await contest.insert()
    return contest


async def _player(name, team, price, slot, status="Active") -> Player:
    p = Player(name=name, team=team, price=price, slot=str(slot.id), status=status)
    await p.insert()
    return p


def _body(players, contest, name="My Squad"):
    ids = [str(p.id) for p in players]
    return {
        "team_name": name,
        "player_ids": ids,
        "captain_id": ids[0],
        "vice_captain_id": ids[1],
        "contest_id": str(contest.id),
    }


async def _squad(bat, bowl, price=100):
    return [
        await _player("bat1", "A", price, bat),
        await _player("bat2", "B", price, bat),
        await _player("bowl1", "A", price, bowl),
        await _player("bowl2", "B", price, bowl),
    ]


# --- team create / update ---------------------------------------------------


async def test_valid_squad_within_purse_is_created(user_client, db):
    bat, bowl = await _slots()
    contest = await _contest(purse=400)
    players = await _squad(bat, bowl, price=100)

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 201, res.text
    assert res.json()["total_value"] == 400


async def test_squad_over_purse_is_rejected(user_client, db):
    bat, bowl = await _slots()
    contest = await _contest(purse=300)
    players = await _squad(bat, bowl, price=100)

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 400
    assert res.json()["detail"]["over_by"] == 100


async def test_slot_rules_still_apply_within_purse(user_client, db):
    bat, bowl = await _slots()
    contest = await _contest(purse=10_000)
    # Three batters and one bowler: cheap enough, wrong shape.
    players = [
        await _player("bat1", "A", 10, bat),
        await _player("bat2", "B", 10, bat),
        await _player("bat3", "C", 10, bat),
        await _player("bowl1", "A", 10, bowl),
    ]

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 400
    assert (
        res.json()["detail"]["message"]
        == "Team violates per-slot selection constraints"
    )


async def test_unpriced_player_cannot_be_picked(user_client, db):
    bat, bowl = await _slots()
    contest = await _contest(purse=10_000)
    players = [
        await _player("bat1", "A", 100, bat),
        await _player("free", "B", 0, bat),
        await _player("bowl1", "A", 100, bowl),
        await _player("bowl2", "B", 100, bowl),
    ]

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 400
    assert res.json()["detail"]["unavailable_players"] == ["free"]


async def test_update_over_purse_is_rejected(user_client, db):
    bat, bowl = await _slots()
    contest = await _contest(purse=400)
    players = await _squad(bat, bowl, price=100)
    created = await user_client.post("/api/teams/", json=_body(players, contest))
    assert created.status_code == 201, created.text

    pricey = await _player("bat-star", "C", 250, bat)
    ids = [str(pricey.id)] + [str(p.id) for p in players[1:]]
    res = await user_client.put(
        f"/api/teams/{created.json()['id']}",
        json={"player_ids": ids, "captain_id": ids[0], "vice_captain_id": ids[1]},
    )

    assert res.status_code == 400
    assert res.json()["detail"]["over_by"] == 150


# --- player pool -------------------------------------------------------------


async def test_pool_hides_unpriced_and_inactive_players(user_client, db):
    bat, _ = await _slots()
    contest = await _contest()
    await _player("priced", "A", 100, bat)
    await _player("unpriced", "A", 0, bat)
    await _player("injured", "A", 100, bat, status="Inactive")

    res = await user_client.get(f"/api/players?contest_id={contest.id}")

    assert res.status_code == 200
    assert [p["name"] for p in res.json()] == ["priced"]


# --- admin contest gate ------------------------------------------------------


def _payload(**overrides):
    start = utc_now() + timedelta(days=1)
    body = {
        "code": "slot-purse",
        "name": "Slot Purse",
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(days=7)).isoformat(),
        "contest_format": "slot_purse",
        "purse": 400,
    }
    body.update(overrides)
    return body


async def test_create_does_not_need_squad_size(client, db):
    bat, bowl = await _slots()
    await _squad(bat, bowl, price=100)

    res = await client.post("/api/admin/contests", json=_payload())

    assert res.status_code == 201, res.text
    assert res.json()["contest_format"] == "slot_purse"


async def test_create_rejects_purse_below_cheapest_slot_minimums(client, db):
    bat, bowl = await _slots()
    await _squad(bat, bowl, price=100)

    res = await client.post("/api/admin/contests", json=_payload(purse=399))

    assert res.status_code == 400
    assert "at least 400" in res.json()["detail"]


async def test_create_rejects_slot_without_enough_priced_players(client, db):
    bat, bowl = await _slots()
    await _player("bat1", "A", 100, bat)
    await _player("bat2", "B", 0, bat)
    await _player("bowl1", "A", 100, bowl)
    await _player("bowl2", "B", 100, bowl)

    res = await client.post("/api/admin/contests", json=_payload(purse=10_000))

    assert res.status_code == 400
    assert "Slot Batters needs 2" in res.json()["detail"]


async def _contest_with_one_team(client, user_client):
    """
    A slot_purse contest holding "Squad One": two batters and two bowlers at
    100 each, two of them from team A. Cheap team-C players keep tighter rules
    feasible, so the existing-team check is what has to catch a change.
    """
    bat, bowl = await _slots()
    players = await _squad(bat, bowl, price=100)
    for slot in (bat, bowl):
        for i in range(2):
            await _player(f"cheap-{slot.code}-{i}", "C", 10, slot)

    created = await client.post("/api/admin/contests", json=_payload(purse=400))
    assert created.status_code == 201, created.text
    contest_id = created.json()["id"]

    ids = [str(p.id) for p in players]
    team = await user_client.post(
        "/api/teams/",
        json={
            "team_name": "Squad One",
            "player_ids": ids,
            "captain_id": ids[0],
            "vice_captain_id": ids[1],
            "contest_id": contest_id,
        },
    )
    assert team.status_code == 201, team.text
    return contest_id, bat, bowl


async def test_tightening_purse_below_an_existing_team_is_refused(
    client, user_client, db
):
    contest_id, _, _ = await _contest_with_one_team(client, user_client)

    res = await client.put(f"/api/admin/contests/{contest_id}", json={"purse": 200})

    assert res.status_code == 400
    detail = res.json()["detail"]
    assert any("Squad One costs 400" in line for line in detail["broken_teams"])

    forced = await client.put(
        f"/api/admin/contests/{contest_id}?force=true", json={"purse": 200}
    )
    assert forced.status_code == 200, forced.text


async def test_lowering_the_team_cap_below_an_existing_team_is_refused(
    client, user_client, db
):
    contest_id, _, _ = await _contest_with_one_team(client, user_client)

    res = await client.put(
        f"/api/admin/contests/{contest_id}", json={"max_players_per_team": 1}
    )

    assert res.status_code == 400
    lines = res.json()["detail"]["broken_teams"]
    assert any("Squad One has 2 players from A" in line for line in lines)


async def test_narrowing_allowed_teams_below_an_existing_team_is_refused(
    client, user_client, db
):
    contest_id, _, _ = await _contest_with_one_team(client, user_client)

    res = await client.put(
        f"/api/admin/contests/{contest_id}",
        json={"contest_type": "daily", "allowed_teams": ["A", "C"]},
    )

    assert res.status_code == 400
    lines = res.json()["detail"]["broken_teams"]
    assert any("Squad One includes players outside" in line for line in lines)


async def test_a_team_breaking_two_rules_is_listed_once(client, user_client, db):
    contest_id, bat, _ = await _contest_with_one_team(client, user_client)
    # Batters now need three, so Squad One breaks the slot rule as well as the
    # tighter purse below.
    bat.min_select = 3
    bat.max_select = 3
    await bat.save()

    res = await client.put(f"/api/admin/contests/{contest_id}", json={"purse": 200})

    assert res.status_code == 400
    detail = res.json()["detail"]
    assert detail["message"].startswith("1 existing team(s)")
    assert len(detail["broken_teams"]) == 1
    line = detail["broken_teams"][0]
    assert "Batters: has 2, needs 3-3" in line
    assert "costs 400, over the purse of 200" in line


async def test_unrelated_edit_is_allowed_when_a_slot_cannot_be_filled(
    client, user_client, db
):
    contest_id, _, bowl = await _contest_with_one_team(client, user_client)
    # Every bowler but one goes inactive: no new squad could fill the slot.
    for p in await Player.find(Player.slot == str(bowl.id)).to_list():
        if p.name != "bowl1":
            p.status = "Inactive"
            await p.save()

    renamed = await client.put(
        f"/api/admin/contests/{contest_id}", json={"name": "Renamed"}
    )
    assert renamed.status_code == 200, renamed.text

    # A rule change still has to pass the feasibility gate.
    repriced = await client.put(
        f"/api/admin/contests/{contest_id}", json={"purse": 500}
    )
    assert repriced.status_code == 400
    assert "Slot Bowlers needs 2" in repriced.json()["detail"]


async def test_switching_to_daily_checks_the_per_team_minimum(client, user_client, db):
    contest_id, _, _ = await _contest_with_one_team(client, user_client)
    # Squad One has two players from each of A and B. Create and update would
    # refuse it in a daily A-vs-B contest needing three from each, so the
    # switch to daily must flag it too.
    settings = await GlobalSettings.get_instance()
    settings.min_players_per_team = 3
    await settings.save()

    res = await client.put(
        f"/api/admin/contests/{contest_id}",
        json={"contest_type": "daily", "allowed_teams": ["A", "B"]},
    )

    assert res.status_code == 400
    lines = res.json()["detail"]["broken_teams"]
    assert any("Squad One has fewer than 3 player(s) from A" in line for line in lines)


async def test_squad_filling_every_slot_maximum_is_accepted(user_client, db):
    """The builder and edit sheet size a full squad by slot maxima."""
    bat = Slot(code="BAT", name="Batters", min_select=1, max_select=2)
    bowl = Slot(code="BOWL", name="Bowlers", min_select=1, max_select=2)
    await bat.insert()
    await bowl.insert()
    contest = await _contest(purse=400)
    players = await _squad(bat, bowl, price=100)

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 201, res.text


async def test_float_rounding_does_not_push_a_fitting_squad_over_the_purse(
    user_client, db
):
    bat, bowl = await _slots()
    contest = await _contest(purse=0.3)
    # 0.1 + 0.1 + 0.1 alone is 0.30000000000000004 in floating point, and the
    # fourth price is far below a point anyone could see.
    players = [
        await _player("bat1", "A", 0.1, bat),
        await _player("bat2", "B", 0.1, bat),
        await _player("bowl1", "A", 0.1, bowl),
        await _player("bowl2", "B", 1e-9, bowl),
    ]

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 201, res.text


async def test_player_without_a_slot_cannot_fill_a_spare_place(user_client, db):
    """
    With slot ranges, the slot minima leave spare places under the cap. A
    player outside every slot must not be able to take one.
    """
    bat = Slot(code="BAT", name="Batters", min_select=1, max_select=2)
    bowl = Slot(code="BOWL", name="Bowlers", min_select=1, max_select=2)
    await bat.insert()
    await bowl.insert()
    contest = await _contest(purse=400)
    unslotted = Player(name="drifter", team="B", price=100, status="Active")
    await unslotted.insert()
    players = [
        await _player("bat1", "A", 100, bat),
        await _player("bowl1", "B", 100, bowl),
        unslotted,
    ]

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 400
    violations = res.json()["detail"]["violations"]
    assert any(
        v["slot"]["name"] == "Players without a slot" and v["actual"] == 1
        for v in violations
    )


async def _ranged_slots():
    """Two slots, each allowing one or two players."""
    bat = Slot(code="BAT", name="Batters", min_select=1, max_select=2)
    bowl = Slot(code="BOWL", name="Bowlers", min_select=1, max_select=2)
    await bat.insert()
    await bowl.insert()
    return bat, bowl


async def _daily_a_vs_b(contest_format, min_per_team=1) -> Contest:
    settings = await GlobalSettings.get_instance()
    settings.min_players_per_team = min_per_team
    await settings.save()
    return await _contest(
        contest_format=contest_format,
        contest_type="daily",
        allowed_teams=["A", "B"],
    )


async def test_squad_below_slot_maxima_still_needs_the_daily_minimum(user_client, db):
    """
    With slot ranges a squad can be legal below the sum of the maxima. It must
    not skip the daily per-team minimum by stopping short of that size.
    """
    bat, bowl = await _ranged_slots()
    for contest_format in (ContestFormat.SLOT_PURSE, ContestFormat.SLOT_BASED):
        contest = await _daily_a_vs_b(contest_format)
        one_sided = [
            await _player(f"bat-{contest_format}", "A", 100, bat),
            await _player(f"bowl-{contest_format}", "A", 100, bowl),
        ]

        res = await user_client.post("/api/teams/", json=_body(one_sided, contest))

        assert res.status_code == 400, (contest_format, res.text)
        assert "from team B" in res.json()["detail"]
        await contest.delete()


async def test_update_below_slot_maxima_still_needs_the_daily_minimum(user_client, db):
    bat, bowl = await _ranged_slots()
    contest = await _daily_a_vs_b(ContestFormat.SLOT_PURSE)
    bat_a = await _player("bat-a", "A", 100, bat)
    bowl_b = await _player("bowl-b", "B", 100, bowl)
    bowl_a = await _player("bowl-a", "A", 100, bowl)
    created = await user_client.post(
        "/api/teams/", json=_body([bat_a, bowl_b], contest)
    )
    assert created.status_code == 201, created.text

    res = await user_client.put(
        f"/api/teams/{created.json()['id']}",
        json={
            "player_ids": [str(bat_a.id), str(bowl_a.id)],
            "captain_id": str(bat_a.id),
            "vice_captain_id": str(bowl_a.id),
        },
    )

    assert res.status_code == 400, res.text
    assert "from team B" in res.json()["detail"]


async def test_switching_to_daily_checks_squads_below_slot_maxima(
    client, user_client, db
):
    bat, bowl = await _ranged_slots()
    ids = [
        str((await _player("bat-a", "A", 100, bat)).id),
        str((await _player("bowl-a", "A", 100, bowl)).id),
    ]
    await _player("bat-b", "B", 10, bat)
    await _player("bowl-b", "B", 10, bowl)
    created = await client.post("/api/admin/contests", json=_payload(purse=400))
    assert created.status_code == 201, created.text
    contest_id = created.json()["id"]
    team = await user_client.post(
        "/api/teams/",
        json={
            "team_name": "One Sided",
            "player_ids": ids,
            "captain_id": ids[0],
            "vice_captain_id": ids[1],
            "contest_id": contest_id,
        },
    )
    assert team.status_code == 201, team.text

    res = await client.put(
        f"/api/admin/contests/{contest_id}",
        json={"contest_type": "daily", "allowed_teams": ["A", "B"]},
    )

    assert res.status_code == 400, res.text
    lines = res.json()["detail"]["broken_teams"]
    assert any("One Sided has fewer than 1 player(s) from B" in line for line in lines)
