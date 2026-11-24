"""
Team composition rules driven by the tournament's GlobalSettings.

Limits how many players a fantasy squad may draw from a single real-world
team. Used by both the create and update paths in routes/teams.py so the
two stay in sync.
"""

from collections import Counter
from typing import List, Optional

from fastapi import HTTPException, status

from app.models.contest import Contest
from app.models.player import Player
from app.models.settings import GlobalSettings
from app.services.auction import resolve_max_players_per_team, team_minimum_shortfall
from app.utils.tenant import TenantId


def _pluralize(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


async def validate_team_composition(
    players: List[Player],
    contest: Optional[Contest],
    *,
    tournament_id: TenantId,
) -> None:
    """
    Enforce per-real-world-team limits on a squad selection.

    Raises HTTPException(400) on violation, returns None otherwise.

    Two rules apply:

    - Maximum (always checked): no real-world team may contribute more than
      ``max_players_per_team`` players, taken from the contest override when
      set and from this tournament's settings otherwise.
    - Minimum: for a daily contest between exactly two teams, each must
      contribute at least ``min_players_per_team``. It applies to every saved
      squad, not only one that fills every slot to its maximum. With slot
      ranges (min_select < max_select) a squad can be legal below the maximum,
      and it must not dodge the minimum by stopping short.
    """
    settings = await GlobalSettings.get_for_tournament(tournament_id)
    max_per_team = resolve_max_players_per_team(contest, settings)
    team_counts = Counter(p.team for p in players if p.team)

    for team_name, count in team_counts.items():
        if count > max_per_team:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot select more than "
                    f"{_pluralize(max_per_team, 'player')} "
                    f"from team {team_name}"
                ),
            )

    allowed = (
        contest.allowed_teams
        if contest is not None and contest.contest_type == "daily"
        else None
    )
    short_team = team_minimum_shortfall(players, allowed, settings.min_players_per_team)
    if short_team is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Must select at least "
                f"{_pluralize(settings.min_players_per_team, 'player')} "
                f"from team {short_team}"
            ),
        )
