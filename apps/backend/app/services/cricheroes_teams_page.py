"""A CricHeroes tournament's registered teams, read from its public Teams page.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9.1. The API has no roster endpoint
and CricHeroes will not add one (§13.11), so before the first match the API
knows nobody. Their public website does: cricheroes.com/tournament/<id>/<slug>/teams
lists every registered team and its players, with the same player ids the API
uses. The page is server-rendered, so one plain GET returns all of it, and it
spends nothing from the API allowance. robots.txt allows tournament pages.

This is not part of our API agreement, and the page's shape is theirs to
change. So everything here fails loudly: a page we cannot read, or one without
the team list where we expect it, raises, and the import writes nothing rather
than a roster that is quietly missing everyone not yet in a match squad.

Where the data is: the page is a Next.js App Router page, which streams its
server data as `self.__next_f.push([1, "<chunk>"])` scripts. Joined, the chunks
contain a `"teamResponse": {"status": true, "data": [...]}` object, each team
being `{team_id, team_name, players: [{player_id, player_name, ...}]}`.
"""

import json
import re
from typing import Any, List, Optional

import httpx

from app.services.cricheroes_client import USER_AGENT
from app.services.cricheroes_errors import CricHeroesHTTPError, CricHeroesTransportError
from app.services.cricheroes_roster import RosterPlayer

WEB_BASE_URL = "https://cricheroes.com"
# The page is about 0.5 MB and served in under a second; this leaves room.
TIMEOUT_SECONDS = 20.0

# CricHeroes put a "Dummy" placeholder in every team (one shared profile), to
# fill a side when someone does not turn up. Not a player anyone would pick.
PLACEHOLDER_NAMES = frozenset({"dummy"})

_FLIGHT_CHUNK = re.compile(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)')
_TEAM_RESPONSE = '"teamResponse":'


class CricHeroesPageError(CricHeroesHTTPError):
    """The public Teams page answered, but not with a team list we can read."""

    def __init__(self, url: str, detail: str, status_code: int = 200):
        self.status_code = status_code
        self.body = detail
        self.url = url
        Exception.__init__(self, f"CricHeroes' Teams page ({url}) {detail}")


def teams_page_url(tournament_id: int, base_url: str = WEB_BASE_URL) -> str:
    # The slug is decorative: CricHeroes serve the page for any value.
    return f"{base_url}/tournament/{tournament_id}/teams/teams"


async def read_registered_players(
    tournament_id: int,
    *,
    client: Optional[httpx.AsyncClient] = None,
    base_url: str = WEB_BASE_URL,
) -> List[RosterPlayer]:
    """Everyone registered to a team of the tournament, placeholders left out.

    A player listed in two teams is kept under the first. Raises
    CricHeroesTransportError when the page cannot be fetched, and
    CricHeroesPageError when it comes back without a readable team list.
    """
    url = teams_page_url(tournament_id, base_url)
    own_client = client is None
    http = client or httpx.AsyncClient(timeout=TIMEOUT_SECONDS)
    try:
        response = await http.get(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html"},
            follow_redirects=True,
        )
    except httpx.HTTPError as exc:
        raise CricHeroesTransportError(
            f"Could not fetch CricHeroes' Teams page ({url}): {exc}"
        ) from exc
    finally:
        if own_client:
            await http.aclose()

    if response.status_code != 200:
        raise CricHeroesPageError(
            url,
            f"returned HTTP {response.status_code}",
            status_code=response.status_code,
        )
    return parse_teams_page(response.text, url=url)


def parse_teams_page(html: str, *, url: str = "") -> List[RosterPlayer]:
    teams = _team_list(html, url)
    players: dict[int, RosterPlayer] = {}
    for team in teams:
        team_name = team.get("team_name") if isinstance(team, dict) else None
        members = team.get("players") if isinstance(team, dict) else None
        if not isinstance(team_name, str) or not isinstance(members, list):
            raise CricHeroesPageError(url, f"has a team we cannot read: {team!r:.200}")
        for member in members:
            player_id = member.get("player_id") if isinstance(member, dict) else None
            name = member.get("player_name") if isinstance(member, dict) else None
            if not isinstance(player_id, int) or not isinstance(name, str):
                raise CricHeroesPageError(
                    url, f"has a player we cannot read: {member!r:.200}"
                )
            if " ".join(name.split()).casefold() in PLACEHOLDER_NAMES:
                continue
            players.setdefault(
                player_id,
                RosterPlayer(player_id=player_id, name=name, team=team_name),
            )
    return list(players.values())


def _team_list(html: str, url: str) -> List[Any]:
    try:
        payload = "".join(json.loads(chunk) for chunk in _FLIGHT_CHUNK.findall(html))
    except ValueError as exc:
        raise CricHeroesPageError(url, f"could not be decoded: {exc}") from exc

    start = payload.find(_TEAM_RESPONSE)
    if start < 0:
        raise CricHeroesPageError(
            url,
            "has no team list. Check the tournament ID; if it is right, "
            "CricHeroes have changed the page and this import needs updating.",
        )
    try:
        response, _ = json.JSONDecoder().raw_decode(
            payload, start + len(_TEAM_RESPONSE)
        )
    except ValueError as exc:
        raise CricHeroesPageError(
            url, f"has a team list that is not valid JSON: {exc}"
        ) from exc

    # A failed answer can still carry `data: []`; that is not "no teams".
    ok = isinstance(response, dict) and response.get("status") is True
    teams = response.get("data") if ok else None
    if not isinstance(teams, list):
        raise CricHeroesPageError(
            url, f"has an unexpected team list: {response!r:.200}"
        )
    return teams
