"""The full auction flow, in the order the team builder performs it.

Admin configures the contest, the builder reads the contest to learn the
format, loads the open pool, then submits a squad.
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


async def test_auction_flow_from_admin_config_to_submitted_squad(
    client, user_client, db
):
    # Auction results are imported: 3 teams, 3 players each, 100k apiece.
    for team in ("A", "B", "C"):
        for i in range(3):
            await AdminPlayer(
                name=f"{team}{i}", team=team, price=100_000, status="Active"
            ).insert()
    # A player nobody bid on, plus one who is out injured.
    await AdminPlayer(name="unsold", team="A", price=0, status="Active").insert()
    await AdminPlayer(name="hurt", team="B", price=90_000, status="Injured").insert()

    start = now_ist() + timedelta(days=1)
    created = await client.post(
        "/api/admin/contests",
        json={
            "code": "auction-e2e",
            "name": "Auction E2E",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(days=7)).isoformat(),
            "contest_format": "auction_purse",
            "purse": 500_000,
            "squad_size": 4,
            "max_players_per_team": 2,
        },
    )
    assert created.status_code == 201, created.text
    contest_id = created.json()["id"]

    # 1. The builder reads the contest to learn how to shape the squad.
    contest = await user_client.get(f"/api/contests/{contest_id}")
    assert contest.status_code == 200, contest.text
    meta = contest.json()
    assert meta["contest_format"] == "auction_purse"
    assert meta["purse"] == 500_000
    assert meta["squad_size"] == 4
    assert meta["effective_max_players_per_team"] == 2

    # 2. It loads the open pool, which excludes the unsold and injured players.
    pool_res = await user_client.get(f"/api/players?contest_id={contest_id}")
    assert pool_res.status_code == 200
    pool = pool_res.json()
    assert len(pool) == 9
    assert "unsold" not in {p["name"] for p in pool}
    assert "hurt" not in {p["name"] for p in pool}

    by_name = {p["name"]: p["id"] for p in pool}

    # 3. Two from A and two from B is exactly the cap and exactly the purse.
    squad = [by_name["A0"], by_name["A1"], by_name["B0"], by_name["B1"]]
    res = await user_client.post(
        "/api/teams/",
        json={
            "team_name": "Purse Perfect",
            "player_ids": squad,
            "captain_id": squad[0],
            "vice_captain_id": squad[1],
            "contest_id": contest_id,
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["total_value"] == 400_000


async def test_third_player_from_one_team_is_refused(client, user_client, db):
    for team in ("A", "B"):
        for i in range(4):
            await AdminPlayer(
                name=f"{team}{i}", team=team, price=1000, status="Active"
            ).insert()

    start = now_ist() + timedelta(days=1)
    created = await client.post(
        "/api/admin/contests",
        json={
            "code": "auction-cap",
            "name": "Auction Cap",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(days=7)).isoformat(),
            "contest_format": "auction_purse",
            "purse": 1_000_000,
            "squad_size": 4,
            "max_players_per_team": 2,
        },
    )
    contest_id = created.json()["id"]

    pool = (await user_client.get(f"/api/players?contest_id={contest_id}")).json()
    by_name = {p["name"]: p["id"] for p in pool}
    squad = [by_name["A0"], by_name["A1"], by_name["A2"], by_name["B0"]]

    res = await user_client.post(
        "/api/teams/",
        json={
            "team_name": "Too Many As",
            "player_ids": squad,
            "captain_id": squad[0],
            "vice_captain_id": squad[1],
            "contest_id": contest_id,
        },
    )

    assert res.status_code == 400
    assert "more than 2 player(s) from team A" in res.json()["detail"]
