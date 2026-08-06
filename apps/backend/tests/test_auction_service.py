import pytest
from fastapi import HTTPException

from app.common.enums.contests import ContestFormat
from app.models.admin.player import Player as AdminPlayer
from app.models.contest import Contest
from app.models.settings import GlobalSettings
from app.services.auction import (
    PoolEntry,
    assert_auction_config_feasible,
    cheapest_squad_cost,
    is_auction_eligible,
    resolve_max_players_per_team,
    validate_auction_squad,
)
from app.utils.timezone import now_ist


def _entries(*pairs) -> list[PoolEntry]:
    return [PoolEntry(price=price, team=team) for price, team in pairs]


# --- eligibility -----------------------------------------------------------


class _P:
    def __init__(self, price, status="Active", team="A", name="p"):
        self.price = price
        self.status = status
        self.team = team
        self.name = name


def test_unauctioned_player_is_not_eligible():
    assert is_auction_eligible(_P(price=0)) is False


def test_inactive_player_is_not_eligible():
    assert is_auction_eligible(_P(price=100, status="Injured")) is False


def test_priced_active_player_is_eligible():
    assert is_auction_eligible(_P(price=100)) is True


def test_missing_status_reads_as_active():
    """Documents written through the public Player model have no status field."""
    player = _P(price=100)
    player.status = None
    assert is_auction_eligible(player) is True


# --- cheapest squad --------------------------------------------------------


def test_cheapest_squad_picks_lowest_prices():
    pool = _entries((10, "A"), (50, "B"), (20, "C"), (99, "D"))
    assert cheapest_squad_cost(pool, squad_size=2, max_per_team=4) == 30


def test_cheapest_squad_respects_per_team_cap():
    # The three cheapest all sit on team A, but only two may be taken.
    pool = _entries((1, "A"), (2, "A"), (3, "A"), (100, "B"))
    assert cheapest_squad_cost(pool, squad_size=3, max_per_team=2) == 103


def test_cheapest_squad_returns_none_when_cap_makes_it_impossible():
    pool = _entries((1, "A"), (2, "A"), (3, "A"))
    assert cheapest_squad_cost(pool, squad_size=3, max_per_team=2) is None


def test_players_without_a_team_are_not_capped():
    pool = _entries((1, None), (2, None), (3, None))
    assert cheapest_squad_cost(pool, squad_size=3, max_per_team=1) == 6


# --- max-per-team resolution ----------------------------------------------


def test_contest_override_beats_global_setting(db):
    contest = Contest(
        code="c", name="c", start_at=now_ist(), end_at=now_ist(),
        max_players_per_team=4,
    )
    settings = GlobalSettings(max_players_per_team=7)
    assert resolve_max_players_per_team(contest, settings) == 4


def test_global_setting_used_when_contest_has_no_override(db):
    contest = Contest(code="c", name="c", start_at=now_ist(), end_at=now_ist())
    settings = GlobalSettings(max_players_per_team=7)
    assert resolve_max_players_per_team(contest, settings) == 7
    assert resolve_max_players_per_team(None, settings) == 7


# --- feasibility gate ------------------------------------------------------


async def _seed_pool(count_per_team: int, teams: list[str], price: float = 1000):
    for team in teams:
        for i in range(count_per_team):
            await AdminPlayer(
                name=f"{team}-{i}", team=team, price=price, status="Active"
            ).insert()


@pytest.mark.asyncio
async def test_feasible_config_passes(db):
    await _seed_pool(count_per_team=4, teams=["A", "B", "C"])
    await assert_auction_config_feasible(
        squad_size=6, purse=1_000_000, max_per_team=4
    )


@pytest.mark.asyncio
async def test_rejects_when_pool_too_small(db):
    await _seed_pool(count_per_team=2, teams=["A"])
    with pytest.raises(HTTPException) as exc:
        await assert_auction_config_feasible(
            squad_size=11, purse=1_000_000, max_per_team=4
        )
    assert exc.value.status_code == 400
    assert "auctioned player" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_rejects_when_too_few_teams_for_the_cap(db):
    # 11 players but only 2 teams; a cap of 4 needs at least 3.
    await _seed_pool(count_per_team=6, teams=["A", "B"])
    with pytest.raises(HTTPException) as exc:
        await assert_auction_config_feasible(
            squad_size=11, purse=1_000_000, max_per_team=4
        )
    assert exc.value.status_code == 400
    assert "at least 3 teams" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_rejects_when_purse_cannot_cover_cheapest_squad(db):
    await _seed_pool(count_per_team=4, teams=["A", "B", "C"], price=100_000)
    with pytest.raises(HTTPException) as exc:
        await assert_auction_config_feasible(
            squad_size=11, purse=1_000_000, max_per_team=4
        )
    assert exc.value.status_code == 400
    assert "too small" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_unauctioned_players_do_not_count_towards_the_pool(db):
    # Priced players are far too few; the rest sit at the unset default.
    await _seed_pool(count_per_team=1, teams=["A", "B"])
    for i in range(20):
        await AdminPlayer(name=f"unpriced-{i}", team="C", price=0).insert()

    with pytest.raises(HTTPException) as exc:
        await assert_auction_config_feasible(
            squad_size=11, purse=1_000_000, max_per_team=4
        )
    assert "Only 2 auctioned player(s)" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_squad_size_required(db):
    with pytest.raises(HTTPException) as exc:
        await assert_auction_config_feasible(
            squad_size=None, purse=1_000_000, max_per_team=4
        )
    assert "squad_size is required" in str(exc.value.detail)


# --- squad validation ------------------------------------------------------


def _auction_contest(squad_size=4, purse=1_000_000):
    return Contest(
        code="auc",
        name="Auction",
        start_at=now_ist(),
        end_at=now_ist(),
        contest_format=ContestFormat.AUCTION_PURSE,
        purse=purse,
        squad_size=squad_size,
        max_players_per_team=4,
    )


@pytest.mark.asyncio
async def test_valid_squad_returns_total_cost(db):
    players = [_P(price=100, team=t, name=t) for t in ("A", "B", "C", "D")]
    total = await validate_auction_squad(
        players, _auction_contest(), submitted_count=4, max_per_team=4
    )
    assert total == 400


@pytest.mark.asyncio
async def test_squad_size_must_match_exactly(db):
    players = [_P(price=100, team=t, name=t) for t in ("A", "B", "C")]
    with pytest.raises(HTTPException) as exc:
        await validate_auction_squad(
            players, _auction_contest(squad_size=4), submitted_count=3, max_per_team=4
        )
    assert "exactly 4 players" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_squad_over_purse_is_rejected(db):
    players = [_P(price=400_000, team=t, name=t) for t in ("A", "B", "C", "D")]
    with pytest.raises(HTTPException) as exc:
        await validate_auction_squad(
            players, _auction_contest(purse=1_000_000), submitted_count=4, max_per_team=4
        )
    assert exc.value.detail["over_by"] == 600_000


@pytest.mark.asyncio
async def test_squad_breaching_per_team_cap_is_rejected(db):
    players = [_P(price=100, team="A", name=f"a{i}") for i in range(5)]
    with pytest.raises(HTTPException) as exc:
        await validate_auction_squad(
            players, _auction_contest(squad_size=5), submitted_count=5, max_per_team=4
        )
    assert "more than 4 player(s) from team A" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_unauctioned_player_cannot_be_selected(db):
    players = [_P(price=100, team="A", name="ok"), _P(price=0, team="B", name="free")]
    with pytest.raises(HTTPException) as exc:
        await validate_auction_squad(
            players, _auction_contest(squad_size=2), submitted_count=2, max_per_team=4
        )
    assert exc.value.detail["unavailable_players"] == ["free"]
