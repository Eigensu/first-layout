"""A CricHeroes tournament's registered teams, read from a saved copy of its
public Teams page.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9.1. The API has no roster endpoint
and CricHeroes will not add one (§13.11), so before the first match the API
knows nobody. Their public website does: cricheroes.com/tournament/<id>/<slug>/teams
lists every registered team and its players, with the same player ids the API
uses.

We do not fetch that page. cricheroes.com's firewall refuses our server (HTTP
403 from Railway, 6 Nov 2026) while serving people's browsers, so CricHeroes
have chosen not to let servers read their website, and we do not work around
that. Instead an admin opens the page in their own browser, saves it, and
uploads the file with the import; this module reads the team list out of it.

The page's shape is CricHeroes' to change, so everything here fails loudly: a
file we cannot read, one without the team list where we expect it, or one for
another tournament raises, and the import writes nothing.

Where the data is: the page is a Next.js App Router page, which streams its
server data as `self.__next_f.push([1, "<chunk>"])` scripts, kept in the file
whether the browser saves the page as sent or as rendered. Joined, the chunks
contain `"tournamentDetails": {"status": true, "data": {"tournament_id": ...}}`
and `"teamResponse": {"status": true, "data": [...]}`, each team being
`{team_id, team_name, players: [{player_id, player_name, ...}]}`.
"""

import json
import re
from typing import Any, List, Optional

from app.services.cricheroes_roster import RosterPlayer

WEB_BASE_URL = "https://cricheroes.com"
# The page is about 0.5 MB as sent; a "complete" save inlines a little more.
MAX_PAGE_BYTES = 5 * 1024 * 1024

# CricHeroes put a "Dummy" placeholder in every team (one shared profile), to
# fill a side when someone does not turn up. Not a player anyone would pick.
PLACEHOLDER_NAMES = frozenset({"dummy"})

_FLIGHT_CHUNK = re.compile(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)')
_TEAM_RESPONSE = '"teamResponse":'
_TOURNAMENT_DETAILS = '"tournamentDetails":'


class TeamsPageError(Exception):
    """The uploaded file is not a Teams page of this tournament we can read.
    The admin's to fix (another file), so the route answers 422."""


def teams_page_url(tournament_id: int, base_url: str = WEB_BASE_URL) -> str:
    """Where the admin saves the page from. The slug is decorative:
    CricHeroes serve the page for any value."""
    return f"{base_url}/tournament/{tournament_id}/teams/teams"


def read_saved_teams_page(html: str, tournament_id: int) -> List[RosterPlayer]:
    """Everyone registered to a team in a saved Teams page of
    `tournament_id`, placeholders left out. A player listed in two teams is
    kept under the first. Raises TeamsPageError for anything else."""
    payload = _flight_data(html)
    page_tournament = _tournament_id(payload)
    if page_tournament != tournament_id:
        raise TeamsPageError(
            f"The uploaded page is for CricHeroes tournament {page_tournament}, "
            f"not {tournament_id}. Save the Teams page of tournament "
            f"{tournament_id} and upload that."
        )
    return _players(_team_list(payload))


def _flight_data(html: str) -> str:
    try:
        payload = "".join(json.loads(chunk) for chunk in _FLIGHT_CHUNK.findall(html))
    except ValueError as exc:
        raise TeamsPageError(f"The uploaded page could not be decoded: {exc}") from exc
    if not payload:
        raise TeamsPageError(
            "The uploaded file is not a saved CricHeroes page. Open the "
            "tournament's Teams page on cricheroes.com, save it as a web page "
            "(HTML), and upload that file."
        )
    return payload


def _decode_after(payload: str, key: str) -> Optional[Any]:
    start = payload.find(key)
    if start < 0:
        return None
    try:
        value, _ = json.JSONDecoder().raw_decode(payload, start + len(key))
    except ValueError as exc:
        raise TeamsPageError(
            f"The uploaded page has a {key.strip(':')} that is not valid JSON: {exc}"
        ) from exc
    return value


def _tournament_id(payload: str) -> Optional[int]:
    details = _decode_after(payload, _TOURNAMENT_DETAILS)
    data = details.get("data") if isinstance(details, dict) else None
    found = data.get("tournament_id") if isinstance(data, dict) else None
    if not isinstance(found, int):
        raise TeamsPageError(
            "The uploaded page does not say which tournament it is. Upload the "
            "tournament's Teams page from cricheroes.com; if that is what this "
            "is, CricHeroes have changed the page and this import needs "
            "updating."
        )
    return found


def _team_list(payload: str) -> List[Any]:
    response = _decode_after(payload, _TEAM_RESPONSE)
    if response is None:
        raise TeamsPageError(
            "The uploaded page has no team list. Save the tournament's Teams "
            "page (the one listing every team and its players), not another "
            "page of the tournament."
        )
    # A failed answer can still carry `data: []`; that is not "no teams".
    ok = isinstance(response, dict) and response.get("status") is True
    teams = response.get("data") if ok else None
    if not isinstance(teams, list):
        raise TeamsPageError(
            f"The uploaded page has an unexpected team list: {response!r:.200}"
        )
    return teams


def _players(teams: List[Any]) -> List[RosterPlayer]:
    players: dict[int, RosterPlayer] = {}
    for team in teams:
        team_name = team.get("team_name") if isinstance(team, dict) else None
        members = team.get("players") if isinstance(team, dict) else None
        if not isinstance(team_name, str) or not isinstance(members, list):
            raise TeamsPageError(
                f"The uploaded page has a team we cannot read: {team!r:.200}"
            )
        for member in members:
            player_id = member.get("player_id") if isinstance(member, dict) else None
            name = member.get("player_name") if isinstance(member, dict) else None
            if not isinstance(player_id, int) or not isinstance(name, str):
                raise TeamsPageError(
                    f"The uploaded page has a player we cannot read: {member!r:.200}"
                )
            if " ".join(name.split()).casefold() in PLACEHOLDER_NAMES:
                continue
            players.setdefault(
                player_id,
                RosterPlayer(player_id=player_id, name=name, team=team_name),
            )
    return list(players.values())
