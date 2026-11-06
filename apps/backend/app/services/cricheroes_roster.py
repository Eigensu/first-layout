"""Bring a CricHeroes tournament's players into one of our tournaments.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9.1. CricHeroes have no roster
endpoint and will not add one (§13.11), so the players come from two places:

- the tournament's public Teams page on cricheroes.com, which lists every
  registered team and player before a ball is bowled, at no API cost
  (`cricheroes_teams_page`, read by the caller and passed in as `registered`);
- the playing squad of every match the tournament has played: one API call
  for the match list, then one per match. These add anyone who played without
  being registered, and file a player who changed sides under their latest team.

Three steps, kept apart so each can be tested on its own:

- `fetch_roster` calls CricHeroes and returns who is registered or played,
  for which team;
- `plan_import` compares that with the players already in our tournament and
  decides, per player, what to do -- it touches nothing;
- `apply_plan` writes the plan.

A preview's roster is kept for a few minutes (`remember` / `recall`), so the
import that follows it writes exactly what the admin saw, without paying for
every squad a second time.

What the import changes is deliberately narrow. New players are created with
a name, a team and their CricHeroes id, and nothing else: price 0 (never
auctioned), no slot, no points. An existing player is only ever given a
CricHeroes id; their price, slot, points, status, team and stats are left as
they are. Photos are not copied: CricHeroes' image host is not one our
frontend may load (next.config.js) and hotlinking it is not ours to decide.
"""

import asyncio
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Awaitable, Callable, Dict, List, Literal, Optional, Sequence, Tuple

from app.models.admin.player import Player
from app.schemas.cricheroes import SquadTeam, TournamentMatch
from app.services.cricheroes_client import CricHeroesClient
from app.services.cricheroes_errors import (
    MATCH_NOT_FOUND_CODE,
    SQUAD_NOT_FOUND_CODE,
    CricHeroesAPIError,
    CricHeroesTransportError,
)
from app.utils.import_players.import_validators import (
    ValidationError,
    validate_name,
    validate_team,
)
from app.utils.tenant import TenantId

# The match-list `type` and `status` of a match not yet played. It has no
# playing squad, so asking for one would spend a call for nothing. The status
# is compared without case: CricHeroes' free text is inconsistently cased.
UPCOMING_TYPE = 2
UPCOMING_STATUS = "upcoming"

# The squad endpoint's two documented refusals that mean "no squad for this
# match": "Match playing squad is not found!" (170003) and "Match is not
# found!" (170002, sent with a 403). Any other refusal -- 170001 above all,
# a tournament outside our agreement -- must fail the import, not shrink it.
NO_SQUAD_CODES = frozenset({SQUAD_NOT_FOUND_CODE, MATCH_NOT_FOUND_CODE})

# Squads are read a few at a time, with a pause between starts: at most 20
# calls a second, well under CricHeroes' 50 -- a 429 is charged like a
# success (§6.5). The whole roster has a deadline, so a slow upstream fails
# the request instead of outliving the browser's patience.
SQUAD_CONCURRENCY = 5
SQUAD_CALL_SPACING_SECONDS = 0.05
ROSTER_DEADLINE_SECONDS = 120.0

# How long a preview's roster is kept for the import that follows it.
PREVIEW_TTL_SECONDS = 600.0

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
    # Read from the public Teams page: players registered (placeholders left
    # out), and the teams they are registered to.
    registered_players: int = 0
    registered_teams: int = 0

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
    registered: Sequence[RosterPlayer] = (),
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    deadline: float = ROSTER_DEADLINE_SECONDS,
) -> Roster:
    """Everyone `registered` to a team, plus everyone named in a playing squad
    of the tournament's played matches.

    Matches are read newest first, so a player who changed sides during the
    tournament is filed under the team they played for last; a squad's team
    wins over the registered one for the same reason. A match
    CricHeroes have no squad for is counted and passed over; any other failure
    (credentials, rate limit, timeout, another refusal) propagates and nothing
    is returned.
    """
    try:
        return await asyncio.wait_for(
            _fetch_roster(client, tournament_id, registered, sleep),
            timeout=deadline,
        )
    except asyncio.TimeoutError as exc:
        raise CricHeroesTransportError(
            f"Reading the squads of CricHeroes tournament {tournament_id} took "
            f"longer than {deadline:g}s"
        ) from exc


async def _fetch_roster(
    client: CricHeroesClient,
    tournament_id: int,
    registered: Sequence[RosterPlayer],
    sleep: Callable[[float], Awaitable[None]],
) -> Roster:
    matches = await client.get_tournament_match_list(tournament_id)
    played = [
        match
        for match in matches
        if match.type != UPCOMING_TYPE
        and (match.status or "").casefold() != UPCOMING_STATUS
    ]
    played.sort(key=lambda match: match.match_date_time or "", reverse=True)

    players: Dict[int, RosterPlayer] = {}
    without_squad = 0
    for squads in await _read_squads(client, played, sleep):
        if not squads or not any(team.match_squad for team in squads):
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
    for member in registered:
        players.setdefault(member.player_id, member)

    return Roster(
        players=list(players.values()),
        matches_listed=len(matches),
        upcoming_matches=len(matches) - len(played),
        matches_read=len(played) - without_squad,
        matches_without_squad=without_squad,
        calls=1 + len(played),
        registered_players=len(registered),
        registered_teams=len({member.team for member in registered}),
    )


async def _read_squads(
    client: CricHeroesClient,
    matches: List[TournamentMatch],
    sleep: Callable[[float], Awaitable[None]],
) -> List[Optional[List[SquadTeam]]]:
    """Each match's squads, in the order given; None where CricHeroes have
    none. The first failure stops any further calls from starting."""
    slots = asyncio.Semaphore(SQUAD_CONCURRENCY)

    async def read(match_id: int) -> Optional[List[SquadTeam]]:
        try:
            return await client.get_match_playing_squad(match_id)
        except CricHeroesAPIError as exc:
            if str(exc.code) in NO_SQUAD_CODES:
                return None
            raise
        finally:
            slots.release()

    def failed(task: asyncio.Task) -> bool:
        return task.done() and not task.cancelled() and task.exception() is not None

    tasks: List[asyncio.Task] = []
    try:
        for index, match in enumerate(matches):
            if index:
                await sleep(SQUAD_CALL_SPACING_SECONDS)
            await slots.acquire()
            if any(failed(task) for task in tasks):
                slots.release()
                break  # gather below raises it
            tasks.append(asyncio.create_task(read(match.match_id)))
        return list(await asyncio.gather(*tasks))
    finally:
        for task in tasks:
            task.cancel()
        # Collect what the cancelled or failed calls left behind, so none is
        # reported as an exception nobody retrieved.
        await asyncio.gather(*tasks, return_exceptions=True)


# -- a preview's roster, kept for the import ------------------------------

_previews: Dict[int, Tuple[float, Roster]] = {}


def remember(tournament_id: int, roster: Roster) -> None:
    """Keep a roster for the import that may follow. In process memory: on
    another replica, or after a restart, the import just reads it afresh."""
    now = time.monotonic()
    for key, (at, _) in list(_previews.items()):
        if now - at > PREVIEW_TTL_SECONDS:
            del _previews[key]
    _previews[tournament_id] = (now, roster)


def recall(tournament_id: int) -> Optional[Roster]:
    entry = _previews.get(tournament_id)
    if entry is None:
        return None
    at, roster = entry
    if time.monotonic() - at > PREVIEW_TTL_SECONDS:
        _previews.pop(tournament_id, None)
        return None
    return roster


# One import at a time per tournament: the plan is made from the players
# there now, so two imports planned side by side would both create the same
# players. In process memory, which serves the single replica walle-api runs.
_import_locks: Dict[Optional[str], asyncio.Lock] = defaultdict(asyncio.Lock)


def import_lock(tournament_id: TenantId) -> asyncio.Lock:
    return _import_locks[str(tournament_id) if tournament_id else None]


def _name_key(name: str) -> str:
    return " ".join(name.split()).casefold()


def plan_import(
    roster: List[RosterPlayer], existing: List[Player]
) -> List[PlannedPlayer]:
    """Decide what to do with each CricHeroes player. Writes nothing.

    - **linked**: a player here already holds their CricHeroes id.
    - **link**: exactly one player here without an id has the same name and
      the same team (both ignoring case and spacing), and no other CricHeroes
      player in the tournament shares the name -- that player is given the id.
    - **create**: nobody here has the name, and nobody else on CricHeroes does.
    - **skip**: anything less certain -- the same name on another team, a name
      shared by several players on either side, or a player here with that
      name already linked to someone else. Guessing would credit one person's
      stats to another, and names must stay unique within a tournament (the
      manual form and the sheet import both rely on it); the admin sets the
      id by a sheet import (§13.2) instead.
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
            ours = candidates[0]
            if _name_key(ours.team) == _name_key(member.team):
                plan.append(PlannedPlayer(member, "link", player=ours))
            else:
                plan.append(
                    PlannedPlayer(
                        member,
                        "skip",
                        player=ours,
                        reason=(
                            f"'{ours.name}' here plays for {ours.team}, but on "
                            f"CricHeroes for {member.team}. If they are the same "
                            "player, set the CricHeroes ID with a sheet import."
                        ),
                    )
                )
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
        elif namesakes[key] > 1:
            plan.append(
                PlannedPlayer(
                    member,
                    "skip",
                    reason=(
                        f"{namesakes[key]} CricHeroes players are named "
                        f"'{member.name}', and names must be unique here. Add "
                        "them by sheet import under distinct names, with their "
                        "CricHeroes IDs."
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


async def apply_plan(
    plan: List[PlannedPlayer],
    *,
    tournament_id: TenantId,
    done: Optional[Counter] = None,
) -> Counter:
    """Create the new players and give the matched ones their id.

    `done` counts each write as it lands ("create", "link"), so a caller can
    record how far an import got if a write fails part way.
    """
    done = Counter() if done is None else done
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
            done["create"] += 1
        elif item.action == "link":
            # A targeted $set of the two fields, so nothing else on the
            # player can be overwritten by a stale copy.
            await item.player.set(
                {
                    Player.cricheroes_player_id: item.roster.player_id,
                    Player.updated_at: now,
                }
            )
            done["link"] += 1
    return done
