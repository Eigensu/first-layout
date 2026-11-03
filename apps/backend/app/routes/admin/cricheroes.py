"""Admin routes over the CricHeroes tournament API.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9. Only the tournament-level
endpoints are surfaced; the rest of the client is for server-side use.

Platform admins only, set once on the router so no route can be added
ungated. Not tournament admins: `{tournament_id}` here is a CricHeroes id,
unrelated to our tournaments (§13.1), so a tournament admin could look up any
tournament's data -- and every call spends the one account-wide quota (§6).
Once CricHeroes ids are linked to our Tournament documents, a tournament admin
can be given access to their own tournament's id.

Responses use our attribute names (`team_name`, `fours`), not CricHeroes'
upstream keys (`Team Name`, `4s`), which are awkward to consume from
TypeScript; hence response_model_by_alias=False on every route. Fields we do
not model still come through under their upstream names.
"""

import math
from typing import AsyncGenerator, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.cricheroes import (
    BattingLeaderboardEntry,
    BowlingLeaderboardEntry,
    InningBattingLeaderboardEntry,
    InningBowlingLeaderboardEntry,
    LeaderboardStatsFilter,
    PointTableRow,
    TournamentBoundaryCount,
    TournamentMatch,
)
from app.services.cricheroes_client import CricHeroesClient
from app.services.cricheroes_errors import (
    CricHeroesAPIError,
    CricHeroesAuthError,
    CricHeroesConfigError,
    CricHeroesError,
    CricHeroesHTTPError,
    CricHeroesRateLimitError,
    CricHeroesTransportError,
)
from app.utils.dependencies import get_platform_admin

router = APIRouter(
    prefix="/api/admin/cricheroes",
    tags=["Admin - CricHeroes"],
    dependencies=[Depends(get_platform_admin)],
)


async def get_cricheroes_client() -> AsyncGenerator[CricHeroesClient, None]:
    """One client per request, closed when the request ends. Tests override
    this to put a mock transport behind a real client."""
    async with CricHeroesClient() as client:
        yield client


def _to_http_error(exc: CricHeroesError) -> HTTPException:
    """Translate a client failure into the status the caller should act on (§7)."""
    if isinstance(exc, CricHeroesConfigError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, CricHeroesAuthError):
        # Our upstream credentials failed, not the admin's session. A 401 here
        # would tell them to log in again, which cannot help.
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, CricHeroesRateLimitError):
        # The one upstream failure passed through as itself: backing off and
        # retrying is a real remedy for the caller.
        headers = None
        if exc.retry_after is not None:
            headers = {"Retry-After": str(math.ceil(exc.retry_after))}
        return HTTPException(status_code=429, detail=str(exc), headers=headers)
    if isinstance(exc, CricHeroesAPIError):
        # CricHeroes reports "no data for this id" as a 200 carrying an error.
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, CricHeroesTransportError):
        return HTTPException(status_code=504, detail=str(exc))
    if isinstance(exc, CricHeroesHTTPError):
        # Includes CricHeroesSchemaError: upstream answered, but unusably.
        return HTTPException(status_code=502, detail=str(exc))
    return HTTPException(status_code=502, detail=str(exc))


@router.get(
    "/tournaments/{tournament_id}/matches",
    response_model=List[TournamentMatch],
    response_model_by_alias=False,
)
async def tournament_matches(
    tournament_id: int,
    match_type: Optional[int] = Query(
        default=None, alias="type", description="1 live, 2 upcoming, 3 past"
    ),
    team_id: Optional[int] = Query(default=None, alias="teamId"),
    order: Optional[str] = Query(default=None),
    client: CricHeroesClient = Depends(get_cricheroes_client),
):
    try:
        return await client.get_tournament_match_list(
            tournament_id, match_type=match_type, team_id=team_id, order=order
        )
    except CricHeroesError as exc:
        raise _to_http_error(exc) from exc


@router.get(
    "/tournaments/{tournament_id}/point-table",
    response_model=List[PointTableRow],
    response_model_by_alias=False,
)
async def tournament_point_table(
    tournament_id: int,
    round_id: Optional[int] = Query(default=None, alias="roundId"),
    group_id: Optional[int] = Query(default=None, alias="groupId"),
    client: CricHeroesClient = Depends(get_cricheroes_client),
):
    try:
        return await client.get_tournament_point_table(
            tournament_id, round_id=round_id, group_id=group_id
        )
    except CricHeroesError as exc:
        raise _to_http_error(exc) from exc


@router.get(
    "/tournaments/{tournament_id}/batting-leaderboard",
    response_model=List[BattingLeaderboardEntry],
    response_model_by_alias=False,
)
async def tournament_batting_leaderboard(
    tournament_id: int,
    sort_filter: Optional[str] = Query(default=None),
    client: CricHeroesClient = Depends(get_cricheroes_client),
):
    try:
        return await client.get_tournament_batting_leaderboard(
            tournament_id, sort_filter=sort_filter
        )
    except CricHeroesError as exc:
        raise _to_http_error(exc) from exc


@router.get(
    "/tournaments/{tournament_id}/inning-batting-leaderboard",
    response_model=List[InningBattingLeaderboardEntry],
    response_model_by_alias=False,
)
async def tournament_inning_batting_leaderboard(
    tournament_id: int,
    sort_filter: Optional[str] = Query(default=None),
    client: CricHeroesClient = Depends(get_cricheroes_client),
):
    try:
        return await client.get_tournament_inning_batting_leaderboard(
            tournament_id, sort_filter=sort_filter
        )
    except CricHeroesError as exc:
        raise _to_http_error(exc) from exc


@router.get(
    "/tournaments/{tournament_id}/bowling-leaderboard",
    response_model=List[BowlingLeaderboardEntry],
    response_model_by_alias=False,
)
async def tournament_bowling_leaderboard(
    tournament_id: int,
    sort_filter: Optional[str] = Query(default=None),
    client: CricHeroesClient = Depends(get_cricheroes_client),
):
    try:
        return await client.get_tournament_bowling_leaderboard(
            tournament_id, sort_filter=sort_filter
        )
    except CricHeroesError as exc:
        raise _to_http_error(exc) from exc


@router.get(
    "/tournaments/{tournament_id}/inning-bowling-leaderboard",
    response_model=List[InningBowlingLeaderboardEntry],
    response_model_by_alias=False,
)
async def tournament_inning_bowling_leaderboard(
    tournament_id: int,
    sort_filter: Optional[str] = Query(default=None),
    client: CricHeroesClient = Depends(get_cricheroes_client),
):
    try:
        return await client.get_tournament_inning_bowling_leaderboard(
            tournament_id, sort_filter=sort_filter
        )
    except CricHeroesError as exc:
        raise _to_http_error(exc) from exc


@router.get(
    "/tournaments/{tournament_id}/stats-filter",
    response_model=LeaderboardStatsFilter,
    response_model_by_alias=False,
)
async def tournament_stats_filter(
    tournament_id: int,
    client: CricHeroesClient = Depends(get_cricheroes_client),
):
    try:
        return await client.get_tournament_leaderboard_stats_filter(tournament_id)
    except CricHeroesError as exc:
        raise _to_http_error(exc) from exc


@router.get(
    "/tournaments/{tournament_id}/boundary-count",
    response_model=TournamentBoundaryCount,
    response_model_by_alias=False,
)
async def tournament_boundary_count(
    tournament_id: int,
    client: CricHeroesClient = Depends(get_cricheroes_client),
):
    try:
        return await client.get_tournament_boundary_count(tournament_id)
    except CricHeroesError as exc:
        raise _to_http_error(exc) from exc
