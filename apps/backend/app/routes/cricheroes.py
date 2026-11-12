"""Public CricHeroes stats for the requesting tournament: points table, MVP
table, batting and bowling leaderboards.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9.2. Unauthenticated, which is safe
only because nothing here can reach CricHeroes. Every route reads the cache
(`cricheroes_cache.read`, §6.7) that the scheduled sync fills; none takes or
builds a CricHeroesClient, so no number of visitors spends a single call of
the annual quota (§6.2, §6.3). Do not add a client dependency here: a route
that needs fresh data needs the sync to fetch it, not the visitor.

The tournament is the request's own (`get_tenant`, from X-Tournament-Slug)
and the CricHeroes id the one a platform admin linked to it (§13.1). No route
takes an id from the caller, so a visitor can read only their own
tournament's tables.

A tournament with no link, or whose tables have not been fetched yet, gets an
empty table rather than an error, and `linked` says which.
"""

from typing import Optional, Type

from fastapi import APIRouter, Depends

from app.models.tournament import Tournament
from app.schemas.cricheroes_public import (
    CachedBattingLeaderboard,
    CachedBowlingLeaderboard,
    CachedMvpTable,
    CachedPointTable,
    CachedTable,
)
from app.services import cricheroes_cache
from app.utils.tenant import TenantId, get_tenant

router = APIRouter(prefix="/api/cricheroes", tags=["CricHeroes"])

_UNKNOWN_TOURNAMENT = {
    400: {"description": "No X-Tournament-Slug, or not a live tournament's"}
}


async def _linked_id(tenant: TenantId) -> Optional[int]:
    """The CricHeroes tournament linked to the request's tournament, if any."""
    if tenant is None:
        # A legacy single-tournament service has no registry row to link.
        return None
    tournament = await Tournament.get(tenant)
    return tournament.cricheroes_tournament_id if tournament else None


async def _cached(
    resource: str, tenant: TenantId, table: Type[CachedTable]
) -> CachedTable:
    cricheroes_id = await _linked_id(tenant)
    if cricheroes_id is None:
        return table(linked=False)
    cached = await cricheroes_cache.read(resource, cricheroes_id)
    if cached is None:
        return table(linked=True)
    # `last_error` stays behind: the reason a refresh failed is ours to read
    # (GET /api/admin/cricheroes/cache), and `fetched_at` already says how
    # old the rows are.
    return table(linked=True, fetched_at=cached.fetched_at, rows=cached.data)


@router.get(
    "/point-table",
    response_model=CachedPointTable,
    response_model_by_alias=False,
    responses=_UNKNOWN_TOURNAMENT,
)
async def point_table(tournament_id: TenantId = Depends(get_tenant)):
    """The tournament's standings, as of the last completed match."""
    return await _cached("point-table", tournament_id, CachedPointTable)


@router.get(
    "/mvp",
    response_model=CachedMvpTable,
    response_model_by_alias=False,
    responses=_UNKNOWN_TOURNAMENT,
)
async def mvp(tournament_id: TenantId = Depends(get_tenant)):
    """CricHeroes' MVP table for the tournament: their points, not ours (§13.5)."""
    return await _cached("mvp", tournament_id, CachedMvpTable)


@router.get(
    "/batting-leaderboard",
    response_model=CachedBattingLeaderboard,
    response_model_by_alias=False,
    responses=_UNKNOWN_TOURNAMENT,
)
async def batting_leaderboard(tournament_id: TenantId = Depends(get_tenant)):
    """Most runs first: CricHeroes' default order."""
    return await _cached("batting-leaderboard", tournament_id, CachedBattingLeaderboard)


@router.get(
    "/bowling-leaderboard",
    response_model=CachedBowlingLeaderboard,
    response_model_by_alias=False,
    responses=_UNKNOWN_TOURNAMENT,
)
async def bowling_leaderboard(tournament_id: TenantId = Depends(get_tenant)):
    """Most wickets first: CricHeroes' default order."""
    return await _cached("bowling-leaderboard", tournament_id, CachedBowlingLeaderboard)
