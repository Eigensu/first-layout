"""
Auction-purse contest rules.

An auction contest replaces the slot-based squad structure with a single open
pool of players priced by their auction sale value. A squad is valid when it:

- contains exactly ``Contest.squad_size`` players,
- costs no more than ``Contest.purse`` (sum of ``Player.price``), and
- draws no more than ``max_players_per_team`` from any one real-world team.

Eligibility: a player joins the pool only once they have been auctioned, i.e.
``price > 0`` and ``status`` is Active. Players still sitting at the unset
default price are excluded rather than treated as nearly free, which would
otherwise be an easy way to beat the purse.
"""

from collections import Counter
from dataclasses import dataclass
from math import ceil
from typing import Iterable, List, Optional, Sequence

from fastapi import HTTPException, status

from app.models.admin.player import Player as AdminPlayer
from app.models.contest import Contest
from app.models.settings import GlobalSettings
from app.common.enums.contests import ContestFormat

ACTIVE_STATUS = "Active"


def is_auction_eligible(player) -> bool:
    """True when the player has an auction value and is Active."""
    price = player.price or 0.0
    player_status = getattr(player, "status", None) or ACTIVE_STATUS
    return price > 0 and player_status == ACTIVE_STATUS


def is_auction_contest(contest: Optional[Contest]) -> bool:
    return (
        contest is not None
        and contest.contest_format == ContestFormat.AUCTION_PURSE
    )


def resolve_max_players_per_team(
    contest: Optional[Contest], settings: GlobalSettings
) -> int:
    """Per-contest override wins; otherwise the global setting applies."""
    if contest is not None and contest.max_players_per_team is not None:
        return contest.max_players_per_team
    return settings.max_players_per_team


@dataclass(frozen=True)
class PoolEntry:
    """Minimal shape the feasibility maths needs from a player."""

    price: float
    team: Optional[str]


def cheapest_squad_cost(
    pool: Sequence[PoolEntry], squad_size: int, max_per_team: int
) -> Optional[float]:
    """
    Cost of the cheapest squad that satisfies the per-team cap.

    Returns None when no squad of ``squad_size`` can be assembled at all.

    Picking cheapest-first while skipping teams that have hit the cap is
    optimal here: the cap makes the selection a partition matroid, on which
    the greedy choice yields a minimum-weight basis.
    """
    if squad_size <= 0:
        return 0.0

    counts: Counter = Counter()
    total = 0.0
    picked = 0

    for entry in sorted(pool, key=lambda e: e.price):
        # Players without a team are not constrained by the per-team cap.
        if entry.team is not None and counts[entry.team] >= max_per_team:
            continue
        if entry.team is not None:
            counts[entry.team] += 1
        total += entry.price
        picked += 1
        if picked == squad_size:
            return total

    return None


def to_pool_entries(players: Iterable) -> List[PoolEntry]:
    return [PoolEntry(price=p.price or 0.0, team=p.team) for p in players]


async def load_eligible_pool() -> List[AdminPlayer]:
    """Every player currently auctionable, across the whole player collection."""
    players = await AdminPlayer.find_all().to_list()
    return [p for p in players if is_auction_eligible(p)]


async def assert_auction_config_feasible(
    squad_size: Optional[int],
    purse: float,
    max_per_team: int,
) -> None:
    """
    Reject an auction configuration no participant could actually satisfy.

    Raises HTTPException(400) naming the specific constraint that fails, so an
    admin finds out at contest-save time rather than a user discovering it
    halfway through building a squad.
    """
    if squad_size is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="squad_size is required for an auction contest",
        )

    pool = await load_eligible_pool()

    if len(pool) < squad_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Only {len(pool)} auctioned player(s) available but squad_size "
                f"is {squad_size}. Import auction values before creating this contest."
            ),
        )

    distinct_teams = {p.team for p in pool if p.team}
    teams_needed = ceil(squad_size / max_per_team)
    if distinct_teams and len(distinct_teams) < teams_needed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"A squad of {squad_size} with at most {max_per_team} per team needs "
                f"players from at least {teams_needed} teams, but the pool only has "
                f"{len(distinct_teams)}."
            ),
        )

    minimum_cost = cheapest_squad_cost(
        to_pool_entries(pool), squad_size, max_per_team
    )
    if minimum_cost is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No squad of {squad_size} players can satisfy the limit of "
                f"{max_per_team} per team with the current player pool."
            ),
        )

    if minimum_cost > purse:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Purse of {purse:,.0f} is too small: the cheapest valid squad of "
                f"{squad_size} players costs {minimum_cost:,.0f}."
            ),
        )


async def validate_auction_squad(
    players: Sequence,
    contest: Contest,
    submitted_count: int,
    max_per_team: int,
) -> float:
    """
    Validate a squad submitted to an auction contest and return its total cost.

    Raises HTTPException(400) on the first violation found.
    """
    ineligible = [p.name for p in players if not is_auction_eligible(p)]
    if ineligible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Some selected players are not available in this auction contest",
                "unavailable_players": ineligible,
            },
        )

    if contest.squad_size is not None and submitted_count != contest.squad_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"This contest requires exactly {contest.squad_size} players, "
                f"got {submitted_count}"
            ),
        )

    team_counts = Counter(p.team for p in players if p.team)
    for team_name, count in team_counts.items():
        if count > max_per_team:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot select more than {max_per_team} player(s) "
                    f"from team {team_name}"
                ),
            )

    total_value = sum(p.price or 0.0 for p in players)
    if total_value > contest.purse:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Squad exceeds the contest purse",
                "purse": contest.purse,
                "total_value": total_value,
                "over_by": total_value - contest.purse,
            },
        )

    return total_value
