"""Bring a CricHeroes tournament's players into one of our tournaments.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9.1. CricHeroes have no roster
endpoint and will not add one (§13.11), so the players are collected from the
playing squad of every match the tournament has played: one call for the match
list, then one per match.

Three steps, kept apart so each can be tested on its own:

- `fetch_roster` calls CricHeroes and returns who played, for which team;
- `plan_import` compares that with the players already in our tournament and
  decides, per player, what to do -- it touches nothing;
- `apply_plan` writes the plan.

What the import changes is deliberately narrow. New players are created with
a name, a team and their CricHeroes id, and nothing else: price 0 (never
auctioned), no slot, no points. An existing player is only ever given a
CricHeroes id; their price, slot, points, status, team and stats are left as
they are. Photos are not copied: CricHeroes' image host is not one our
frontend may load (next.config.js) and hotlinking it is not ours to decide.
"""

import asyncio
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Awaitable, Callable, Dict, List, Literal, Optional

from app.models.admin.player import Player
from app.services.cricheroes_client import CricHeroesClient
from app.services.cricheroes_errors import CricHeroesAPIError
from app.utils.import_players.import_validators import (
    ValidationError,
    validate_name,
    validate_team,
)
from app.utils.tenant import TenantId

# The match-list `type` and `status` of a match not yet played. It has no
# playing squad, so asking for one would spend a call for nothing.
UPCOMING_TYPE = 2
UPCOMING_STATUS = "upcoming"

# Pause between squad calls. Keeps a long tournament well under CricHeroes'
# 50 requests a second; a 429 is charged like a success (§6.5).
SQUAD_CALL_SPACING_SECONDS = 0.05

Action = Literal["create", "link", "linked", "skip"]


@dataclass
class RosterPlayer:
    player_id: int
    name: str
    team: str


@dataclass
class Roster:
    players: List[RosterPlayer]
    matches_listed: int
    upcoming_matches: int
    # Played matches whose squad was read, and those CricHeroes had none for.
    matches_read: int
    matches_without_squad: int
    calls: int

    @property
    def teams(self) -> List[str]:
        return sorted({player.team for player in self.players})


@dataclass
class PlannedPlayer:
    roster: RosterPlayer
    action: Action
    reason: Optional[str] = None
    # Ours: the player to link, or the one already linked.
    player: Optional[Player] = None


@dataclass
class ImportCounts:
    created: int = 0
    linked: int = 0
    already_linked: int = 0
    skipped: int = 0


async def fetch_roster(
    client: CricHeroesClient,
    tournament_id: int,
    *,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> Roster:
    """Everyone named in a playing squad of the tournament's played matches.

    Matches are read newest first, so a player who changed sides during the
    tournament is filed under the team they played for last. A match
    CricHeroes have no squad for is counted and passed over; any other failure
    (credentials, rate limit, timeout) propagates and nothing is returned.
    """
    matches = await client.get_tournament_match_list(tournament_id)
    calls = 1
    played = [
        match
        for match in matches
        if match.type != UPCOMING_TYPE and match.status != UPCOMING_STATUS
    ]
    played.sort(key=lambda match: match.match_date_time or "", reverse=True)

    players: Dict[int, RosterPlayer] = {}
    without_squad = 0
    for index, match in enumerate(played):
        if index:
            await sleep(SQUAD_CALL_SPACING_SECONDS)
        calls += 1
        try:
            squads = await client.get_match_playing_squad(match.match_id)
        except CricHeroesAPIError:
            # CricHeroes' "no data" answer, e.g. an abandoned match.
            without_squad += 1
            continue
        if not any(team.match_squad for team in squads):
            without_squad += 1
            continue
        for team in squads:
            for member in team.match_squad:
                players.setdefault(
                    member.player_id,
                    RosterPlayer(
                        player_id=member.player_id,
                        name=member.player_name,
                        team=team.team_name,
                    ),
                )

    return Roster(
        players=list(players.values()),
        matches_listed=len(matches),
        upcoming_matches=len(matches) - len(played),
        matches_read=len(played) - without_squad,
        matches_without_squad=without_squad,
        calls=calls,
    )


def _name_key(name: str) -> str:
    return " ".join(name.split()).casefold()


def plan_import(
    roster: List[RosterPlayer], existing: List[Player]
) -> List[PlannedPlayer]:
    """Decide what to do with each CricHeroes player. Writes nothing.

    - **linked**: a player here already holds their CricHeroes id.
    - **link**: exactly one player here without an id has the same name
      (ignoring case and spacing), and no other CricHeroes player in the
      tournament shares it -- that player is given the id.
    - **create**: nobody here has the name.
    - **skip**: the name is ambiguous, or a player here with that name is
      already linked to a different CricHeroes player. Guessing would credit
      one person's stats to another; the admin sets the id by a sheet import
      (§13.2) instead.
    """
    by_id = {
        player.cricheroes_player_id: player
        for player in existing
        if player.cricheroes_player_id is not None
    }
    unlinked_by_name: Dict[str, List[Player]] = defaultdict(list)
    linked_names = set()
    for player in existing:
        if player.cricheroes_player_id is None:
            unlinked_by_name[_name_key(player.name)].append(player)
        else:
            linked_names.add(_name_key(player.name))
    namesakes = Counter(
        _name_key(member.name) for member in roster if member.player_id not in by_id
    )

    plan = []
    for member in roster:
        if member.player_id in by_id:
            plan.append(PlannedPlayer(member, "linked", player=by_id[member.player_id]))
            continue

        try:
            validate_name(member.name)
            validate_team(member.team)
        except ValidationError as exc:
            plan.append(PlannedPlayer(member, "skip", reason=exc.message))
            continue

        key = _name_key(member.name)
        candidates = unlinked_by_name.get(key, [])
        if len(candidates) == 1 and namesakes[key] == 1:
            plan.append(PlannedPlayer(member, "link", player=candidates[0]))
        elif candidates:
            plan.append(
                PlannedPlayer(
                    member,
                    "skip",
                    reason=(
                        f"{len(candidates)} player(s) here and {namesakes[key]} on "
                        f"CricHeroes are named '{member.name}'. Set the CricHeroes "
                        "ID with a sheet import."
                    ),
                )
            )
        elif key in linked_names:
            plan.append(
                PlannedPlayer(
                    member,
                    "skip",
                    reason=(
                        f"A player named '{member.name}' here is already linked to "
                        "a different CricHeroes player."
                    ),
                )
            )
        else:
            plan.append(PlannedPlayer(member, "create"))
    return plan


def count(plan: List[PlannedPlayer]) -> ImportCounts:
    actions = Counter(item.action for item in plan)
    return ImportCounts(
        created=actions["create"],
        linked=actions["link"],
        already_linked=actions["linked"],
        skipped=actions["skip"],
    )


async def apply_plan(plan: List[PlannedPlayer], *, tournament_id: TenantId) -> None:
    """Create the new players and give the matched ones their id."""
    now = datetime.utcnow()
    for item in plan:
        if item.action == "create":
            await Player(
                tournament_id=tournament_id,
                name=validate_name(item.roster.name),
                team=validate_team(item.roster.team),
                cricheroes_player_id=item.roster.player_id,
                created_at=now,
                updated_at=now,
            ).insert()
        elif item.action == "link":
            # A targeted $set of the two fields, so nothing else on the
            # player can be overwritten by a stale copy.
            await item.player.set(
                {
                    Player.cricheroes_player_id: item.roster.player_id,
                    Player.updated_at: now,
                }
            )
