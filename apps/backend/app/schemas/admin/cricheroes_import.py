"""Responses of the CricHeroes player import (spec §9.1)."""

from typing import List, Literal, Optional

from pydantic import BaseModel


class RosterImportPlayer(BaseModel):
    """One CricHeroes player, and what the import does (or did) with them."""

    cricheroes_player_id: int
    name: str
    team: str
    # create: added as a new player. link: an existing player of the same name
    # is given this id. linked: already had it. skip: see `reason`.
    action: Literal["create", "link", "linked", "skip"]
    reason: Optional[str] = None
    # Ours, for link and linked: who the id goes to, so a preview shows when
    # a same-named player here is on a different team.
    player_id: Optional[str] = None
    player_name: Optional[str] = None
    player_team: Optional[str] = None


class RosterImportResponse(BaseModel):
    dry_run: bool
    cricheroes_tournament_id: int
    # Matches in CricHeroes' list; of those, not yet played (not read), read,
    # and played but with no squad on CricHeroes.
    matches_listed: int
    upcoming_matches: int
    matches_read: int
    matches_without_squad: int
    # Upstream calls this request spent against the annual quota.
    cricheroes_calls: int
    teams: List[str]
    # On a dry run, what an import would do; otherwise what it did.
    created: int
    linked: int
    already_linked: int
    skipped: int
    players: List[RosterImportPlayer]
