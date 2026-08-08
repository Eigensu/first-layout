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

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.models.admin.player import Player as AdminPlayer
from app.models.contest import Contest
from app.models.settings import GlobalSettings
from app.models.team import Team
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


async def load_eligible_pool(
    allowed_teams: Optional[Sequence[str]] = None,
) -> List[AdminPlayer]:
    """
    Every player a participant in this contest could actually pick.

    ``allowed_teams`` mirrors the daily-contest restriction enforced in
    routes/teams.py and the public player listing: when a daily contest names
    its teams, the rest of the collection is off limits and must not count
    towards feasibility.
    """
    players = await AdminPlayer.find_all().to_list()
    eligible = [p for p in players if is_auction_eligible(p)]
    if allowed_teams:
        permitted = set(allowed_teams)
        eligible = [p for p in eligible if p.team in permitted]
    return eligible


async def assert_auction_config_feasible(
    squad_size: Optional[int],
    purse: float,
    max_per_team: int,
    allowed_teams: Optional[Sequence[str]] = None,
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

    pool = await load_eligible_pool(allowed_teams)
    scope = (
        f" from the allowed teams ({', '.join(allowed_teams)})"
        if allowed_teams
        else ""
    )

    if len(pool) < squad_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Only {len(pool)} auctioned player(s) available{scope} but "
                f"squad_size is {squad_size}. Import auction values before "
                f"creating this contest."
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


@dataclass(frozen=True)
class SquadViolation:
    """A broken auction rule, in both a human and an API-friendly shape."""

    # Short summary for admin-facing reports about existing teams.
    summary: str
    # Payload for the HTTPException raised at submission time. Kept separate
    # because the team builder parses specific keys out of it.
    detail: object


def evaluate_squad(
    players: Sequence,
    squad_size: Optional[int],
    purse: float,
    max_per_team: int,
    submitted_count: Optional[int] = None,
    allowed_teams: Optional[Sequence[str]] = None,
) -> Optional[SquadViolation]:
    """
    The single definition of what makes an auction squad valid.

    Returns the first violation found, or None when the squad is legal. Both
    the submission path and the admin's re-validation of existing teams go
    through here so the two can never drift apart.
    """
    count = submitted_count if submitted_count is not None else len(players)

    ineligible = [p.name for p in players if not is_auction_eligible(p)]
    if ineligible:
        return SquadViolation(
            summary=(
                "includes players no longer in the auction pool: "
                + ", ".join(ineligible)
            ),
            detail={
                "message": "Some selected players are not available in this auction contest",
                "unavailable_players": ineligible,
            },
        )

    if allowed_teams:
        permitted = set(allowed_teams)
        outside = [p.name for p in players if p.team and p.team not in permitted]
        if outside:
            return SquadViolation(
                summary="includes players outside the allowed teams: "
                + ", ".join(outside),
                detail={
                    "message": "Selected players include teams disallowed for this contest",
                    "disallowed_players": outside,
                    "allowed_teams": list(allowed_teams),
                },
            )

    if squad_size is not None and count != squad_size:
        return SquadViolation(
            summary=f"has {count} player(s), needs exactly {squad_size}",
            detail=(
                f"This contest requires exactly {squad_size} players, got {count}"
            ),
        )

    team_counts = Counter(p.team for p in players if p.team)
    for team_name, team_count in team_counts.items():
        if team_count > max_per_team:
            return SquadViolation(
                summary=(
                    f"has {team_count} players from {team_name}, "
                    f"over the limit of {max_per_team}"
                ),
                detail=(
                    f"Cannot select more than {max_per_team} player(s) "
                    f"from team {team_name}"
                ),
            )

    total_value = sum(p.price or 0.0 for p in players)
    if total_value > purse:
        return SquadViolation(
            summary=(
                f"costs {total_value:,.0f}, over the purse of {purse:,.0f}"
            ),
            detail={
                "message": "Squad exceeds the contest purse",
                "purse": purse,
                "total_value": total_value,
                "over_by": total_value - purse,
            },
        )

    return None


async def validate_auction_squad(
    players: Sequence,
    contest: Contest,
    submitted_count: int,
    max_per_team: int,
) -> float:
    """
    Validate a squad submitted to an auction contest and return its total cost.

    Raises HTTPException(400) on the first violation found. Allowed teams are
    checked separately in routes/teams.py, which applies them to every contest
    format, so they are not re-checked here.
    """
    violation = evaluate_squad(
        players=players,
        squad_size=contest.squad_size,
        purse=contest.purse,
        max_per_team=max_per_team,
        submitted_count=submitted_count,
    )
    if violation is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=violation.detail,
        )

    return sum(p.price or 0.0 for p in players)


async def find_teams_breaking_auction_rules(
    contest_id: str,
    squad_size: Optional[int],
    purse: float,
    max_per_team: int,
    allowed_teams: Optional[Sequence[str]] = None,
) -> List[str]:
    """
    Existing squads in this contest that the given rules would invalidate.

    Returns one "<team name> <reason>" line per broken team. Tightening a purse
    or a cap after teams exist would otherwise leave those squads enrolled and
    scoring under rules they no longer satisfy.
    """
    teams = await Team.find(Team.contest_id == str(contest_id)).to_list()
    if not teams:
        return []

    # One lookup for every player referenced by any squad in the contest.
    referenced: set = set()
    for team in teams:
        for pid in team.player_ids:
            try:
                referenced.add(PydanticObjectId(pid))
            except Exception:
                continue
    players = (
        await AdminPlayer.find({"_id": {"$in": list(referenced)}}).to_list()
        if referenced
        else []
    )
    by_id = {str(p.id): p for p in players}

    broken: List[str] = []
    for team in teams:
        squad = [by_id[pid] for pid in team.player_ids if pid in by_id]
        violation = evaluate_squad(
            players=squad,
            squad_size=squad_size,
            purse=purse,
            max_per_team=max_per_team,
            submitted_count=len(team.player_ids),
            allowed_teams=allowed_teams,
        )
        if violation is not None:
            broken.append(f"{team.team_name} {violation.summary}")

    return broken
