"""Async client for the CricHeroes third-party tournament API (v1).

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md is the design; the section numbers in
comments refer to it. One method per documented endpoint. Every call is a GET
against `{base_url}/thirdparty/client/...` carrying the five documented headers.

The annual call quota, not the rate limit, is what constrains this API (§6), so
nothing here calls upstream more than asked: no prefetching, and retries only on
429, few of them, and only while there is time budget left.
"""

import asyncio
import logging
import random
from typing import Any, Awaitable, Callable, Dict, List, Optional, Type, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.schemas.cricheroes import (
    BattingLeaderboardEntry,
    BowlingLeaderboardEntry,
    InningBattingLeaderboardEntry,
    InningBowlingLeaderboardEntry,
    LeaderboardStatsFilter,
    ManhattanGraph,
    MatchPartnership,
    PlayerBattingSeason,
    PlayerBowlingSeason,
    PlayerMatchBattingData,
    PlayerMatchBowlingData,
    PointTableRow,
    SquadTeam,
    TournamentBoundaryCount,
    TournamentMatch,
    WormGraph,
)
from app.services.cricheroes_errors import (
    CricHeroesAPIError,
    CricHeroesAuthError,
    CricHeroesConfigError,
    CricHeroesHTTPError,
    CricHeroesRateLimitError,
    CricHeroesSchemaError,
    CricHeroesTransportError,
)
from config.settings import get_settings

logger = logging.getLogger("app.cricheroes")

# The "Client" resource group is only served to third-party clients.
DEVICE_TYPE = "thirdparty-client"
PATH_PREFIX = "thirdparty/client"

# Backoff before retry n (0-based) is BACKOFF_BASE * BACKOFF_FACTOR**n, with
# +/-20% jitter: ~0.5s, then ~1.5s (§6.5).
BACKOFF_BASE = 0.5
BACKOFF_FACTOR = 3.0

ModelT = TypeVar("ModelT", bound=BaseModel)
Sleep = Callable[[float], Awaitable[None]]


def _parse_retry_after(value: Optional[str]) -> Optional[float]:
    """Seconds from a Retry-After header, or None.

    Only the delta-seconds form is read. An HTTP-date, or anything else, is
    treated as absent, and the normal backoff applies instead.
    """
    if value is None:
        return None
    try:
        seconds = float(value.strip())
    except ValueError:
        return None
    return seconds if seconds >= 0 else None


class CricHeroesClient:
    """Typed access to the CricHeroes "Client" resource group.

    Use it as an async context manager. It holds one connection pool for its
    lifetime and closes it on exit -- unless the pool was passed in, in which
    case its owner closes it.
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        udid: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
        client: Optional[httpx.AsyncClient] = None,
        sleep: Optional[Sleep] = None,
    ):
        settings = get_settings()
        self.api_key = api_key if api_key is not None else settings.cricheroes_api_key
        self.secret_access_key = (
            secret_access_key
            if secret_access_key is not None
            else settings.cricheroes_secret_access_key
        )
        self.udid = udid if udid is not None else settings.cricheroes_udid
        self.base_url = (base_url or settings.cricheroes_base_url).rstrip("/")
        self.timeout = (
            timeout if timeout is not None else settings.cricheroes_timeout_seconds
        )
        self.max_retries = (
            max_retries if max_retries is not None else settings.cricheroes_max_retries
        )
        self._client = client
        self._owns_client = client is None
        # Injectable so retry tests count attempts without waiting.
        self._sleep = sleep or asyncio.sleep

    async def __aenter__(self) -> "CricHeroesClient":
        return self

    async def __aexit__(self, *exc_info) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    # -- request plumbing --------------------------------------------------

    def _headers(self) -> Dict[str, str]:
        """The five documented headers, or ConfigError before any connection.

        A partial set is rejected upstream the same way a wrong one is, so
        "some credentials" counts as not configured rather than spending a call
        to find out (§5.1).
        """
        values = {
            "CRICHEROES_API_KEY": self.api_key,
            "CRICHEROES_SECRET_ACCESS_KEY": self.secret_access_key,
            "CRICHEROES_UDID": self.udid,
        }
        missing = [name for name, value in values.items() if not value]
        if missing:
            raise CricHeroesConfigError(missing)
        return {
            "Content-Type": "application/json",
            "api-key": self.api_key,
            "secret_access_key": self.secret_access_key,
            "udid": self.udid,
            "device-type": DEVICE_TYPE,
        }

    @staticmethod
    def _clean_params(params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Drop unset parameters: `?teamId=` is not the same as no teamId."""
        return {k: v for k, v in (params or {}).items() if v is not None}

    @staticmethod
    def _backoff(attempt: int) -> float:
        return BACKOFF_BASE * (BACKOFF_FACTOR**attempt) * random.uniform(0.8, 1.2)

    async def _request(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """GET one endpoint and return the envelope's `data`.

        Raises a CricHeroesError subclass for every failure; see
        app/services/cricheroes_errors.py for which is which.
        """
        headers = self._headers()
        url = f"{self.base_url}/{PATH_PREFIX}/{path}"
        query = self._clean_params(params)
        # Total time we are prepared to spend waiting between retries.
        budget = self.timeout
        attempt = 0
        while True:
            # Headers carry the credentials, so they are never logged.
            logger.info("CricHeroes GET %s params=%s", url, query)
            try:
                response = await self._get_client().get(
                    url, headers=headers, params=query
                )
            except httpx.HTTPError as exc:
                raise CricHeroesTransportError(
                    f"CricHeroes request to {url} failed: {exc!r}"
                ) from exc

            if response.status_code != 429:
                break

            # Retry only on 429 (§6.5). Retry-After wins over our backoff; if
            # it asks for longer than the budget left, give up now rather than
            # come back early and spend another call on a second 429.
            retry_after = _parse_retry_after(response.headers.get("Retry-After"))
            delay = retry_after if retry_after is not None else self._backoff(attempt)
            if attempt >= self.max_retries or delay > budget:
                raise CricHeroesRateLimitError(retry_after=retry_after)
            logger.warning(
                "CricHeroes 429 on %s; retry %d/%d in %.2fs",
                url,
                attempt + 1,
                self.max_retries,
                delay,
            )
            budget -= delay
            attempt += 1
            await self._sleep(delay)

        if response.status_code in (401, 403):
            raise CricHeroesAuthError(response.status_code)
        if response.status_code >= 400:
            raise CricHeroesHTTPError(response.status_code, response.text[:500])

        try:
            payload = response.json()
        except ValueError:
            raise CricHeroesHTTPError(
                response.status_code, f"non-JSON body: {response.text[:500]}"
            )
        if not isinstance(payload, dict):
            raise CricHeroesHTTPError(
                response.status_code, f"unexpected body: {response.text[:500]}"
            )
        if payload.get("status") is not True:
            error = payload.get("error") or {}
            raise CricHeroesAPIError(error.get("code"), error.get("message"))
        return payload.get("data")

    async def _get_model(
        self,
        path: str,
        model: Type[ModelT],
        params: Optional[Dict[str, Any]] = None,
    ) -> ModelT:
        data = await self._request(path, params)
        # Some single-object endpoints wrap the object in a one-element list.
        if isinstance(data, list) and len(data) == 1:
            data = data[0]
        try:
            return model.model_validate(data)
        except ValidationError as exc:
            raise CricHeroesSchemaError(path, str(exc)) from exc

    async def _get_model_list(
        self,
        path: str,
        model: Type[ModelT],
        params: Optional[Dict[str, Any]] = None,
    ) -> List[ModelT]:
        data = await self._request(path, params)
        if data is None:
            return []
        if not isinstance(data, list):
            raise CricHeroesSchemaError(
                path, f"expected a list, got {type(data).__name__}"
            )
        try:
            return [model.model_validate(item) for item in data]
        except ValidationError as exc:
            raise CricHeroesSchemaError(path, str(exc)) from exc

    # -- match --------------------------------------------------------------

    async def get_match_playing_squad(
        self, match_id: int, team_id: Optional[int] = None
    ) -> List[SquadTeam]:
        """Each side's XI for a match, or one side's with `team_id`."""
        return await self._get_model_list(
            f"get-match-playing-squad/{match_id}", SquadTeam, {"teamId": team_id}
        )

    async def get_match_current_partnership(self, match_id: int) -> MatchPartnership:
        """The partnership at the crease now."""
        return await self._get_model(
            f"get-match-current-partnership/{match_id}", MatchPartnership
        )

    async def get_match_partnership(
        self, match_id: int, team_id: int
    ) -> List[MatchPartnership]:
        """Every partnership of one team's innings.

        Same path as the current partnership plus a team id segment -- and a
        list where that returns one object. Easy to mis-wire (§5.5).
        """
        return await self._get_model_list(
            f"get-match-current-partnership/{match_id}/{team_id}", MatchPartnership
        )

    async def get_match_manhattan_graph(self, match_id: int) -> ManhattanGraph:
        """Runs and wickets per over, for both innings."""
        return await self._get_model(
            f"get-match-manhattan-graph/{match_id}", ManhattanGraph
        )

    async def get_match_worm_graph(self, match_id: int) -> WormGraph:
        """The manhattan's overs plus running total and run rate."""
        return await self._get_model(f"get-match-worm-graph/{match_id}", WormGraph)

    # -- tournament ---------------------------------------------------------

    async def get_tournament_boundary_count(
        self, tournament_id: int
    ) -> TournamentBoundaryCount:
        """Boundary totals. Documented as a one-element list; unwrapped."""
        return await self._get_model(
            f"get-tournament-boundary-count/{tournament_id}", TournamentBoundaryCount
        )

    async def get_player_tournament_match_batting_data(
        self, tournament_id: int, player_id: int
    ) -> PlayerMatchBattingData:
        """One player's batting in a tournament, one row per innings.

        The rows carry no match id or date (§13.9).
        """
        return await self._get_model(
            f"get-player-tournament-match-batting-data/{tournament_id}/{player_id}",
            PlayerMatchBattingData,
        )

    async def get_player_tournament_match_bowling_data(
        self, tournament_id: int, player_id: int
    ) -> PlayerMatchBowlingData:
        """One player's bowling in a tournament, one row per spell.

        The rows carry no match id or date (§13.9).
        """
        return await self._get_model(
            f"get-player-tournament-match-bowling-data/{tournament_id}/{player_id}",
            PlayerMatchBowlingData,
        )

    async def get_tournament_match_list(
        self,
        tournament_id: int,
        match_type: Optional[int] = None,
        team_id: Optional[int] = None,
        order: Optional[str] = None,
    ) -> List[TournamentMatch]:
        """The tournament's matches. `match_type` is sent as `type`; the doc
        describes it as 1 live, 2 upcoming, 3 past (§13.3)."""
        return await self._get_model_list(
            f"get-tournament-match-list/{tournament_id}",
            TournamentMatch,
            {"type": match_type, "teamId": team_id, "order": order},
        )

    async def get_tournament_point_table(
        self,
        tournament_id: int,
        round_id: Optional[int] = None,
        group_id: Optional[int] = None,
    ) -> List[PointTableRow]:
        return await self._get_model_list(
            f"get-tournament-point-table/{tournament_id}",
            PointTableRow,
            {"roundId": round_id, "groupId": group_id},
        )

    # -- leaderboards -------------------------------------------------------
    #
    # sort_filter is passed through unchecked. The doc's lists of valid values
    # disagree with what the stats-filter endpoint reports (§13.3), so that
    # endpoint, not a hardcoded list, is the authority.

    async def get_tournament_batting_leaderboard(
        self, tournament_id: int, sort_filter: Optional[str] = None
    ) -> List[BattingLeaderboardEntry]:
        return await self._get_model_list(
            f"get-tournament-batting-leaderboard/{tournament_id}",
            BattingLeaderboardEntry,
            {"sort_filter": sort_filter},
        )

    async def get_tournament_inning_batting_leaderboard(
        self, tournament_id: int, sort_filter: Optional[str] = None
    ) -> List[InningBattingLeaderboardEntry]:
        return await self._get_model_list(
            f"get-tournament-inning-batting-leaderboard/{tournament_id}",
            InningBattingLeaderboardEntry,
            {"sort_filter": sort_filter},
        )

    async def get_tournament_bowling_leaderboard(
        self, tournament_id: int, sort_filter: Optional[str] = None
    ) -> List[BowlingLeaderboardEntry]:
        return await self._get_model_list(
            f"get-tournament-bowling-leaderboard/{tournament_id}",
            BowlingLeaderboardEntry,
            {"sort_filter": sort_filter},
        )

    async def get_tournament_inning_bowling_leaderboard(
        self, tournament_id: int, sort_filter: Optional[str] = None
    ) -> List[InningBowlingLeaderboardEntry]:
        return await self._get_model_list(
            f"get-tournament-inning-bowling-leaderboard/{tournament_id}",
            InningBowlingLeaderboardEntry,
            {"sort_filter": sort_filter},
        )

    async def get_tournament_leaderboard_stats_filter(
        self, tournament_id: int
    ) -> LeaderboardStatsFilter:
        """Which leaderboards, seasons and teams the tournament supports."""
        return await self._get_model(
            f"get-tournament-stat-leaderboard-filter/{tournament_id}",
            LeaderboardStatsFilter,
        )

    # -- player season stats ------------------------------------------------

    async def get_player_batting_season_data(
        self, player_id: int
    ) -> List[PlayerBattingSeason]:
        """A player's batting totals per season, plus a "Career" row."""
        return await self._get_model_list(
            f"get-player-batting-season-data/{player_id}", PlayerBattingSeason
        )

    async def get_player_bowling_season_data(
        self, player_id: int
    ) -> List[PlayerBowlingSeason]:
        """A player's bowling totals per season, plus a "Career" row."""
        return await self._get_model_list(
            f"get-player-bowling-season-data/{player_id}", PlayerBowlingSeason
        )
