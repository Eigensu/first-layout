"""Feasibility under daily-contest team restrictions, and rule changes that
would strand squads that were legal when they were built.
"""

from datetime import timedelta

import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.models.admin.player import Player as AdminPlayer
from app.models.user import User
from app.utils.dependencies import get_current_active_user
from app.utils.timezone import now_ist


@pytest_asyncio.fixture
async def user_client(db):
    from main import app

    u = User(
        username="builder",
        email="builder@example.com",
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


def _payload(**overrides):
    start = now_ist() + timedelta(days=1)
    body = {
        "code": "auction-rules",
        "name": "Auction Rules",
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(days=7)).isoformat(),
        "contest_format": "auction_purse",
        "purse": 1_000_000,
        "squad_size": 4,
        "max_players_per_team": 2,
    }
    body.update(overrides)
    return body


async def _seed(teams, per_team=4, price=100_000):
    for team in teams:
        for i in range(per_team):
            await AdminPlayer(
                name=f"{team}{i}", team=team, price=price, status="Active"
            ).insert()


# --- daily contests restrict the feasible pool ----------------------------


async def test_feasibility_counts_only_the_allowed_teams(client, db):
    """The wider pool is irrelevant when a daily contest names its teams."""
    # Plenty of players overall, but the two allowed teams cannot fill a squad
    # of 4 while capped at 2 per team.
    await _seed(["A", "B"], per_team=1)
    await _seed(["C", "D", "E", "F"], per_team=5)

    res = await client.post(
        "/api/admin/contests",
        json=_payload(contest_type="daily", allowed_teams=["A", "B"]),
    )

    assert res.status_code == 400
    assert "allowed teams (A, B)" in res.json()["detail"]


async def test_feasibility_passes_when_allowed_teams_can_fill_the_squad(client, db):
    await _seed(["A", "B"], per_team=2)
    await _seed(["Z"], per_team=9)

    res = await client.post(
        "/api/admin/contests",
        json=_payload(contest_type="daily", allowed_teams=["A", "B"]),
    )

    assert res.status_code == 201, res.text


async def test_full_contest_still_sees_the_whole_pool(client, db):
    """allowed_teams only bites on daily contests."""
    await _seed(["A", "B", "C"], per_team=2)

    res = await client.post(
        "/api/admin/contests",
        json=_payload(contest_type="full", allowed_teams=["A"]),
    )

    assert res.status_code == 201, res.text


# --- rule changes against existing teams -----------------------------------


async def _contest_with_one_team(client, user_client):
    """
    A contest whose pool stays feasible under tighter rules, holding one team
    that does not. Without the cheap C/D players the pool gate would reject the
    tightened config first and the existing-team check would never run.
    """
    await _seed(["A", "B"], per_team=2, price=100_000)
    await _seed(["C", "D"], per_team=2, price=10_000)

    created = await client.post("/api/admin/contests", json=_payload())
    assert created.status_code == 201, created.text
    contest_id = created.json()["id"]

    pool = (await user_client.get(f"/api/players?contest_id={contest_id}")).json()
    by_name = {p["name"]: p["id"] for p in pool}
    # Two from A and two from B: legal now at 400,000.
    ids = [by_name["A0"], by_name["A1"], by_name["B0"], by_name["B1"]]

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
    assert team.json()["total_value"] == 400_000
    return contest_id


async def test_tightening_the_purse_below_an_existing_team_is_refused(
    client, user_client, db
):
    contest_id = await _contest_with_one_team(client, user_client)

    res = await client.put(
        f"/api/admin/contests/{contest_id}", json={"purse": 200_000}
    )

    assert res.status_code == 400
    detail = res.json()["detail"]
    assert "1 existing team(s) would break" in detail["message"]
    assert any("Squad One costs 400,000" in line for line in detail["broken_teams"])


async def test_shrinking_the_squad_size_is_refused(client, user_client, db):
    contest_id = await _contest_with_one_team(client, user_client)

    res = await client.put(
        f"/api/admin/contests/{contest_id}", json={"squad_size": 3}
    )

    assert res.status_code == 400
    detail = res.json()["detail"]
    assert any(
        "has 4 player(s), needs exactly 3" in line for line in detail["broken_teams"]
    )


async def test_tightening_the_per_team_cap_is_refused(client, user_client, db):
    contest_id = await _contest_with_one_team(client, user_client)

    res = await client.put(
        f"/api/admin/contests/{contest_id}", json={"max_players_per_team": 1}
    )

    assert res.status_code == 400
    detail = res.json()["detail"]
    assert any("over the limit of 1" in line for line in detail["broken_teams"])


async def test_force_applies_the_change_anyway(client, user_client, db):
    contest_id = await _contest_with_one_team(client, user_client)

    res = await client.put(
        f"/api/admin/contests/{contest_id}?force=true", json={"purse": 200_000}
    )

    assert res.status_code == 200, res.text
    assert res.json()["purse"] == 200_000


async def test_loosening_the_rules_is_allowed(client, user_client, db):
    contest_id = await _contest_with_one_team(client, user_client)

    res = await client.put(
        f"/api/admin/contests/{contest_id}", json={"purse": 2_000_000}
    )

    assert res.status_code == 200, res.text
    assert res.json()["purse"] == 2_000_000


async def test_unrelated_edits_do_not_trip_the_team_check(client, user_client, db):
    contest_id = await _contest_with_one_team(client, user_client)

    res = await client.put(
        f"/api/admin/contests/{contest_id}", json={"name": "Renamed"}
    )

    assert res.status_code == 200, res.text
    assert res.json()["name"] == "Renamed"
