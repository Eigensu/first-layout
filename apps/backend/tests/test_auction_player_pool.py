"""Public player listing: the auction contest pool.

An auction contest's pool is only the players who were actually auctioned.
Slot-based contests keep seeing everyone, since price is cosmetic there.
"""

from datetime import timedelta

from app.common.enums.contests import ContestFormat
from app.models.contest import Contest
from app.models.player import Player
from app.utils.timezone import now_ist


async def _contest(**overrides) -> Contest:
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


async def _seed_players():
    await Player(name="auctioned", team="A", price=200_000, status="Active").insert()
    await Player(name="unpriced", team="A", price=0, status="Active").insert()
    await Player(name="injured", team="B", price=150_000, status="Injured").insert()
    # Documents written before status existed have no such field at all.
    await Player(name="legacy", team="B", price=120_000).insert()


async def test_auction_pool_excludes_unpriced_and_inactive(anon_client, db):
    await _seed_players()
    contest = await _contest(
        contest_format=ContestFormat.AUCTION_PURSE, squad_size=2
    )

    res = await anon_client.get(f"/api/players?contest_id={contest.id}")

    assert res.status_code == 200
    names = sorted(p["name"] for p in res.json())
    assert names == ["auctioned", "legacy"]


async def test_slot_based_contest_pool_is_unfiltered(anon_client, db):
    await _seed_players()
    contest = await _contest(contest_format=ContestFormat.SLOT_BASED)

    res = await anon_client.get(f"/api/players?contest_id={contest.id}")

    assert res.status_code == 200
    assert len(res.json()) == 4


async def test_listing_without_a_contest_is_unfiltered(anon_client, db):
    await _seed_players()

    res = await anon_client.get("/api/players")

    assert res.status_code == 200
    assert len(res.json()) == 4


async def test_auction_pool_still_honours_daily_allowed_teams(anon_client, db):
    await _seed_players()
    contest = await _contest(
        contest_format=ContestFormat.AUCTION_PURSE,
        contest_type="daily",
        allowed_teams=["B"],
        squad_size=1,
    )

    res = await anon_client.get(f"/api/players?contest_id={contest.id}")

    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    # "injured" is on team B but not auctionable; "legacy" satisfies both rules.
    assert names == ["legacy"]
