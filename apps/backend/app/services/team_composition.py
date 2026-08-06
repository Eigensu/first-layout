"""
Team composition rules driven by GlobalSettings.

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
from app.services.auction import resolve_max_players_per_team


def _pluralize(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


async def validate_team_composition(
    players: List[Player],
    contest: Optional[Contest],
    squad_size: int,
    max_players_allowed: Optional[int],
) -> None:
    """
    Enforce per-real-world-team limits on a squad selection.

    Raises HTTPException(400) on violation, returns None otherwise.

    Two rules apply:

    - Maximum (always checked): no real-world team may contribute more than
      ``max_players_per_team`` players, taken from the contest override when
      set and from GlobalSettings otherwise.
    - Minimum (only on a complete squad): for a daily contest between exactly
      two teams, each must contribute at least ``min_players_per_team``. This
      is deferred until the squad is full so partially-built teams are not
      rejected mid-selection.
    """
    settings = await GlobalSettings.get_instance()
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

    squad_is_complete = (
        max_players_allowed is not None and squad_size == max_players_allowed
    )
    if not squad_is_complete:
        return

    if (
        contest is None
        or contest.contest_type != "daily"
        or not contest.allowed_teams
        or len(contest.allowed_teams) != 2
    ):
        return

    for required_team in contest.allowed_teams:
        if team_counts.get(required_team, 0) < settings.min_players_per_team:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Must select at least "
                    f"{_pluralize(settings.min_players_per_team, 'player')} "
                    f"from team {required_team}"
                ),
            )
