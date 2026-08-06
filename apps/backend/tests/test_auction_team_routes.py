"""Team creation under both contest formats.

Covers the format branch in routes/teams.py: auction contests validate squad
size, purse and the per-team cap while ignoring slot structure entirely; slot
based contests keep their existing per-slot rules.
"""

from datetime import timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.common.enums.contests import ContestFormat
from app.models.admin.slot import Slot
from app.models.contest import Contest
from app.models.player import Player
from app.models.user import User
from app.utils.dependencies import get_current_active_user, get_admin_user
from app.utils.timezone import now_ist


@pytest_asyncio.fixture
async def user(db):
    u = User(
        username="player-one",
        email="player@example.com",
        hashed_password="not-a-real-hash",
        is_active=True,
        is_verified=True,
    )
    await u.insert()
    return u


@pytest_asyncio.fixture
async def user_client(db, user):
    """HTTP client authenticated as a regular (non-admin) user."""
    from main import app

    async def _fake_user():
        return user

    app.dependency_overrides[get_current_active_user] = _fake_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_current_active_user, None)


async def _make_contest(**overrides) -> Contest:
    start = now_ist() + timedelta(days=1)
    fields = {
        "code": "c1",
        "name": "Contest",
        "start_at": start,
        "end_at": start + timedelta(days=7),
    }
    fields.update(overrides)
    contest = Contest(**fields)
    await contest.insert()
    return contest


async def _auction_contest(**overrides) -> Contest:
    defaults = {
        "contest_format": ContestFormat.AUCTION_PURSE,
        "purse": 1_000_000,
        "squad_size": 4,
        "max_players_per_team": 2,
    }
    defaults.update(overrides)
    return await _make_contest(**defaults)


async def _players(specs) -> list[Player]:
    """specs: iterable of (name, team, price) or (name, team, price, slot)."""
    created = []
    for spec in specs:
        name, team, price = spec[0], spec[1], spec[2]
        slot = spec[3] if len(spec) > 3 else None
        p = Player(name=name, team=team, price=price, slot=slot, status="Active")
        await p.insert()
        created.append(p)
    return created


def _body(players, contest, name="My Squad"):
    ids = [str(p.id) for p in players]
    return {
        "team_name": name,
        "player_ids": ids,
        "captain_id": ids[0],
        "vice_captain_id": ids[1],
        "contest_id": str(contest.id),
    }


# --- auction format --------------------------------------------------------


async def test_squad_within_purse_is_created(user_client, db):
    contest = await _auction_contest()
    players = await _players([
        ("a1", "A", 100_000), ("a2", "A", 100_000),
        ("b1", "B", 100_000), ("b2", "B", 100_000),
    ])

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 201, res.text
    assert res.json()["total_value"] == 400_000


async def test_squad_over_purse_is_rejected(user_client, db):
    contest = await _auction_contest(purse=300_000)
    players = await _players([
        ("a1", "A", 100_000), ("a2", "A", 100_000),
        ("b1", "B", 100_000), ("b2", "B", 100_000),
    ])

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 400
    assert res.json()["detail"]["over_by"] == 100_000


async def test_squad_of_the_wrong_size_is_rejected(user_client, db):
    contest = await _auction_contest(squad_size=4)
    players = await _players([
        ("a1", "A", 1000), ("a2", "A", 1000), ("b1", "B", 1000),
    ])

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 400
    assert "exactly 4 players" in res.json()["detail"]


async def test_per_team_cap_uses_the_contest_override(user_client, db):
    # Global default is 7; this contest caps at 2.
    contest = await _auction_contest(max_players_per_team=2)
    players = await _players([
        ("a1", "A", 1000), ("a2", "A", 1000),
        ("a3", "A", 1000), ("b1", "B", 1000),
    ])

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 400
    assert "more than 2 player(s) from team A" in res.json()["detail"]


async def test_unauctioned_player_cannot_be_picked(user_client, db):
    contest = await _auction_contest()
    players = await _players([
        ("a1", "A", 1000), ("a2", "A", 1000),
        ("b1", "B", 1000), ("free", "B", 0),
    ])

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 400
    assert res.json()["detail"]["unavailable_players"] == ["free"]


async def test_auction_squad_ignores_slot_rules(user_client, db):
    """Slots exist but must not constrain an auction squad."""
    slot = Slot(code="BAT", name="Batters", min_select=4, max_select=4)
    await slot.insert()

    contest = await _auction_contest()
    # None of these carry a slot, which would fail the slot-based rules.
    players = await _players([
        ("a1", "A", 1000), ("a2", "A", 1000),
        ("b1", "B", 1000), ("b2", "B", 1000),
    ])

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 201, res.text


# --- slot-based format (regression) ---------------------------------------


async def test_slot_based_contest_still_enforces_slot_rules(user_client, db):
    slot = Slot(code="BAT", name="Batters", min_select=4, max_select=4)
    await slot.insert()

    contest = await _make_contest(contest_format=ContestFormat.SLOT_BASED)
    # Only two players in a slot that requires four.
    players = await _players([
        ("a1", "A", 10, str(slot.id)),
        ("a2", "A", 10, str(slot.id)),
    ])

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 400
    assert res.json()["detail"]["message"] == "Team violates per-slot selection constraints"


async def test_slot_based_contest_accepts_a_valid_squad(user_client, db):
    slot = Slot(code="BAT", name="Batters", min_select=2, max_select=4)
    await slot.insert()

    contest = await _make_contest(contest_format=ContestFormat.SLOT_BASED)
    players = await _players([
        ("a1", "A", 10, str(slot.id)),
        ("b1", "B", 10, str(slot.id)),
    ])

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 201, res.text
    # price stays cosmetic for slot-based contests
    assert res.json()["total_value"] == 20


async def test_slot_based_squad_is_not_capped_by_a_purse(user_client, db):
    """A slot-based contest ignores purse entirely, whatever the prices are."""
    slot = Slot(code="BAT", name="Batters", min_select=2, max_select=4)
    await slot.insert()

    contest = await _make_contest(contest_format=ContestFormat.SLOT_BASED, purse=1)
    players = await _players([
        ("a1", "A", 500_000, str(slot.id)),
        ("b1", "B", 500_000, str(slot.id)),
    ])

    res = await user_client.post("/api/teams/", json=_body(players, contest))

    assert res.status_code == 201, res.text
    assert res.json()["total_value"] == 1_000_000
