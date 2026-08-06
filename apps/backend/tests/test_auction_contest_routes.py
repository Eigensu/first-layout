"""Admin contest routes: the auction-purse configuration gate.

An unsatisfiable auction setup must be rejected at save time rather than
discovered by a user who cannot finish a squad.
"""

from datetime import timedelta

from app.models.admin.player import Player as AdminPlayer
from app.utils.timezone import now_ist


def _payload(**overrides):
    start = now_ist() + timedelta(days=1)
    body = {
        "code": "auction-1",
        "name": "Auction Contest",
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(days=7)).isoformat(),
        "contest_format": "auction_purse",
        "purse": 1_000_000,
        "squad_size": 6,
        "max_players_per_team": 4,
    }
    body.update(overrides)
    return body


async def _seed_pool(teams, per_team=4, price=1000):
    for team in teams:
        for i in range(per_team):
            await AdminPlayer(
                name=f"{team}-{i}", team=team, price=price, status="Active"
            ).insert()


async def test_creates_auction_contest_when_config_is_satisfiable(client, db):
    await _seed_pool(["A", "B", "C"])

    res = await client.post("/api/admin/contests", json=_payload())

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["contest_format"] == "auction_purse"
    assert body["purse"] == 1_000_000
    assert body["squad_size"] == 6
    assert body["max_players_per_team"] == 4


async def test_rejects_squad_size_the_team_cap_cannot_satisfy(client, db):
    # Two teams only; a squad of 11 capped at 4 per team needs three.
    await _seed_pool(["A", "B"], per_team=8)

    res = await client.post(
        "/api/admin/contests", json=_payload(squad_size=11)
    )

    assert res.status_code == 400
    assert "at least 3 teams" in res.json()["detail"]


async def test_rejects_purse_smaller_than_cheapest_possible_squad(client, db):
    await _seed_pool(["A", "B", "C"], price=100_000)

    res = await client.post(
        "/api/admin/contests", json=_payload(squad_size=6, purse=100)
    )

    assert res.status_code == 400
    assert "too small" in res.json()["detail"]


async def test_rejects_when_no_players_have_auction_values(client, db):
    for i in range(20):
        await AdminPlayer(name=f"unpriced-{i}", team="A", price=0).insert()

    res = await client.post("/api/admin/contests", json=_payload())

    assert res.status_code == 400
    assert "Only 0 auctioned player(s)" in res.json()["detail"]


async def test_auction_contest_requires_squad_size(client, db):
    await _seed_pool(["A", "B", "C"])

    payload = _payload()
    del payload["squad_size"]
    res = await client.post("/api/admin/contests", json=payload)

    assert res.status_code == 422
    assert "squad_size is required" in res.text


async def test_slot_based_contest_skips_the_auction_gate(client, db):
    """A slot-based contest needs no priced pool at all."""
    res = await client.post(
        "/api/admin/contests",
        json=_payload(code="slot-1", contest_format="slot_based", squad_size=None),
    )

    assert res.status_code == 201, res.text
    assert res.json()["contest_format"] == "slot_based"


async def test_update_cannot_make_a_contest_unsatisfiable(client, db):
    await _seed_pool(["A", "B", "C"])
    created = await client.post("/api/admin/contests", json=_payload())
    contest_id = created.json()["id"]

    res = await client.put(
        f"/api/admin/contests/{contest_id}", json={"squad_size": 99}
    )

    assert res.status_code == 400
    assert "auctioned player" in res.json()["detail"]


async def test_existing_contests_default_to_slot_based(client, db):
    """Contests created without the new fields keep the old behaviour."""
    start = now_ist() + timedelta(days=1)
    res = await client.post(
        "/api/admin/contests",
        json={
            "code": "legacy-1",
            "name": "Legacy Contest",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(days=7)).isoformat(),
        },
    )

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["contest_format"] == "slot_based"
    assert body["squad_size"] is None
    assert body["max_players_per_team"] is None
