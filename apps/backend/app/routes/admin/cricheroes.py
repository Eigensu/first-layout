"""Admin routes over the CricHeroes tournament API.

docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9. Only the tournament-level
endpoints are surfaced; the rest of the client is for server-side use.

Platform admins only, set once on the router so no route can be added
ungated. Not tournament admins: `{tournament_id}` here is a CricHeroes id,
unrelated to our tournaments (§13.1), so a tournament admin could look up any
tournament's data -- and every call spends the one account-wide quota (§6).
Once CricHeroes ids are linked to our Tournament documents, a tournament admin
can be given access to their own tournament's id.

One route writes: importing a CricHeroes tournament's players into the
tournament whose admin page it is called from (§9.1). Platform admins
administer every tournament, so the same gate covers the write. Two more look
after the API itself: the call counter (§6.6) and the cache (§6.7), which
"refresh now" writes to.

Responses use our attribute names (`team_name`, `fours`), not CricHeroes'
upstream keys (`Team Name`, `4s`), which are awkward to consume from
TypeScript; hence response_model_by_alias=False on every route. Fields we do
not model still come through under their upstream names.
"""

import math
from collections import Counter
from typing import AsyncGenerator, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.models.admin.audit_log import AdminActionLog
from app.models.admin.player import Player
from app.models.user import User
from app.schemas.admin.cricheroes_import import RosterImportPlayer, RosterImportResponse
from app.schemas.admin.cricheroes_ops import (
    CacheStatusResponse,
    RefreshResponse,
    UsageReport,
)
from app.schemas.cricheroes import (
    BattingLeaderboardEntry,
    BowlingLeaderboardEntry,
    InningBattingLeaderboardEntry,
    InningBowlingLeaderboardEntry,
    LeaderboardStatsFilter,
    PlayerMvp,
    PointTableRow,
    TournamentBoundaryCount,
    TournamentMatch,
)
from app.services import (
    cricheroes_cache,
    cricheroes_roster,
    cricheroes_teams_page,
    cricheroes_usage,
)
from app.services.cricheroes_client import CricHeroesClient
from app.services.cricheroes_errors import (
    CricHeroesAccessError,
    CricHeroesAPIError,
    CricHeroesAuthError,
    CricHeroesBlockedError,
    CricHeroesConfigError,
    CricHeroesError,
    CricHeroesHTTPError,
    CricHeroesRateLimitError,
    CricHeroesTransportError,
)
from app.utils.dependencies import get_platform_admin
from app.utils.tenant import TenantId, get_tenant, scoped
from config.settings import get_settings

router = APIRouter(
    prefix="/api/admin/cricheroes",
    tags=["Admin - CricHeroes"],
    dependencies=[Depends(get_platform_admin)],
)


async def get_cricheroes_client() -> AsyncGenerator[CricHeroesClient, None]:
    """One client per request, closed when the request ends, every call
    counted (§6.6). Tests override this to put a mock transport behind a real
    client."""
    async with cricheroes_usage.counted_client() as client:
        yield client


async def _read_uploaded_teams_page(
    upload: Optional[UploadFile], tournament_id: int
) -> List[cricheroes_roster.RosterPlayer]:
    """The registered players in an uploaded Teams page (§9.1), or none when
    no page was uploaded. A file that is not this tournament's Teams page is
    the admin's to fix, so a 422 saying what is wrong with it."""
    if upload is None:
        return []
    raw = await upload.read(cricheroes_teams_page.MAX_PAGE_BYTES + 1)
    if len(raw) > cricheroes_teams_page.MAX_PAGE_BYTES:
        raise HTTPException(
            status_code=422,
            detail="The uploaded page is larger than a CricHeroes Teams page "
            "can be. Save the page as HTML only and upload that.",
        )
    try:
        return cricheroes_teams_page.read_saved_teams_page(
            raw.decode("utf-8", errors="replace"), tournament_id
        )
    except cricheroes_teams_page.TeamsPageError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _to_http_error(exc: CricHeroesError) -> HTTPException:
    """Translate a client failure into the status the caller should act on (§7)."""
    if isinstance(exc, CricHeroesConfigError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, CricHeroesAuthError):
        # Our upstream credentials failed, not the admin's session. A 401 here
        # would tell them to log in again, which cannot help.
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, CricHeroesBlockedError):
        # CricHeroes' firewall, not their API, refused us. An upstream failure
        # like any other to the admin; the detail says it is not the keys.
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, CricHeroesRateLimitError):
        # The one upstream failure passed through as itself: backing off and
        # retrying is a real remedy for the caller.
        headers = None
        if exc.retry_after is not None:
            headers = {"Retry-After": str(math.ceil(exc.retry_after))}
        return HTTPException(status_code=429, detail=str(exc), headers=headers)
    if isinstance(exc, CricHeroesAccessError):
        # Our keys work, but this id is outside what CricHeroes serve us. The
        # admin can act on that (another id), unlike a credentials failure.
        # Not 403: that is our own permission gate's answer, and the shared
        # frontend client shows every 403 as "you do not have permission".
        return HTTPException(status_code=422, detail=str(exc))
    if isinstance(exc, CricHeroesAPIError):
        # CricHeroes report "no data for this id" as an error code, mostly
        # with a 200.
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


@router.get(
    "/tournaments/{tournament_id}/mvp",
    response_model=List[PlayerMvp],
    response_model_by_alias=False,
)
async def tournament_mvp(
    tournament_id: int,
    client: CricHeroesClient = Depends(get_cricheroes_client),
):
    """CricHeroes' MVP table for the tournament: their points, not ours."""
    try:
        return await client.get_tournament_player_mvp(tournament_id)
    except CricHeroesError as exc:
        raise _to_http_error(exc) from exc


@router.post(
    "/tournaments/{tournament_id}/import-players",
    response_model=RosterImportResponse,
)
async def import_tournament_players(
    tournament_id: int,
    dry_run: bool = Query(default=True),
    client: CricHeroesClient = Depends(get_cricheroes_client),
    teams_page: Optional[UploadFile] = File(
        default=None,
        description="The tournament's Teams page from cricheroes.com, saved as HTML",
    ),
    current_user: User = Depends(get_platform_admin),
    target: TenantId = Depends(get_tenant),
):
    """Add the players of CricHeroes tournament `tournament_id` to ours (§9.1).

    `tournament_id` is CricHeroes'; ours is the one the request is made from.
    The registered teams come from `teams_page`, the tournament's public
    Teams page as the admin saved it in their browser: cricheroes.com refuses
    our server, so we do not fetch it ourselves. It is read first, and a file
    that is not this tournament's Teams page fails the request before any API
    call is spent. Without it the roster is the played matches' squads alone.
    A preview costs one call plus one per played match. An import within
    PREVIEW_TTL_SECONDS of a preview uses that preview's roster -- what the
    admin saw, at no further cost; otherwise it reads the squads itself.
    """
    roster = None if dry_run else cricheroes_roster.recall(tournament_id)
    reused_preview = roster is not None
    if roster is None:
        try:
            registered = await _read_uploaded_teams_page(teams_page, tournament_id)
            roster = await cricheroes_roster.fetch_roster(
                client, tournament_id, registered=registered
            )
        except CricHeroesError as exc:
            raise _to_http_error(exc) from exc
        cricheroes_roster.remember(tournament_id, roster)
    calls = 0 if reused_preview else roster.calls

    # Plan and write under one lock, from the players there now, so two
    # imports into one tournament cannot both create the same players.
    async with cricheroes_roster.import_lock(target):
        existing = await scoped(Player, target).to_list()
        plan = cricheroes_roster.plan_import(roster.players, existing)
        counts = cricheroes_roster.count(plan)

        if not dry_run:
            done: Counter = Counter()
            completed = False
            try:
                await cricheroes_roster.apply_plan(
                    plan, tournament_id=target, done=done
                )
                completed = True
            finally:
                # Written even when a write fails part way, with what landed:
                # those players exist, and this is the only record of how.
                await AdminActionLog(
                    tournament_id=target,
                    admin_id=str(current_user.id),
                    action="player.import_cricheroes",
                    target_type="cricheroes_tournament",
                    target_id=str(tournament_id),
                    details={
                        "completed": completed,
                        "created": done["create"],
                        "linked": done["link"],
                        "planned_created": counts.created,
                        "planned_linked": counts.linked,
                        "already_linked": counts.already_linked,
                        "skipped": counts.skipped,
                        "registered_players": roster.registered_players,
                        "registered_teams": roster.registered_teams,
                        "cricheroes_calls": calls,
                        "reused_preview": reused_preview,
                    },
                ).insert()

    return RosterImportResponse(
        dry_run=dry_run,
        cricheroes_tournament_id=tournament_id,
        matches_listed=roster.matches_listed,
        upcoming_matches=roster.upcoming_matches,
        matches_read=roster.matches_read,
        matches_without_squad=roster.matches_without_squad,
        registered_players=roster.registered_players,
        registered_teams=roster.registered_teams,
        cricheroes_calls=calls,
        reused_preview=reused_preview,
        teams=roster.teams,
        created=counts.created,
        linked=counts.linked,
        already_linked=counts.already_linked,
        skipped=counts.skipped,
        players=[
            RosterImportPlayer(
                cricheroes_player_id=item.roster.player_id,
                name=item.roster.name,
                team=item.roster.team,
                action=item.action,
                reason=item.reason,
                player_id=str(item.player.id) if item.player else None,
                player_name=item.player.name if item.player else None,
                player_team=item.player.team if item.player else None,
            )
            for item in plan
        ],
    )


# -- the API itself: calls made, and the cache ------------------------------


@router.get("/usage", response_model=UsageReport)
async def usage(days: int = Query(default=30, ge=1, le=366)):
    """Calls made this quota term and over the last `days` days (§6.6)."""
    return await cricheroes_usage.usage(days)


@router.get("/cache", response_model=CacheStatusResponse)
async def cache_status():
    """What is cached, how old it is, and whether its last refresh failed."""
    settings = get_settings()
    return CacheStatusResponse(
        tournaments=settings.cricheroes_sync_tournaments,
        max_age_hours=settings.cricheroes_snapshot_max_age_hours,
        snapshots=await cricheroes_cache.status(),
    )


@router.post("/cache/refresh", response_model=RefreshResponse)
async def refresh_cache(
    tournament_id: Optional[int] = Query(default=None),
    force: bool = Query(default=False),
    client: CricHeroesClient = Depends(get_cricheroes_client),
):
    """Refresh the cache now, as the scheduled run would (§6.7).

    Only tournaments in CRICHEROES_SYNC_TOURNAMENT_IDS, so this cannot be used
    to cache, and pay for, arbitrary ids. `force` reads every resource whether
    results changed or not. A tournament refreshed in the last few minutes is
    passed over either way.
    """
    configured = get_settings().cricheroes_sync_tournaments
    if tournament_id is not None and tournament_id not in configured:
        raise HTTPException(
            status_code=422,
            detail=f"Tournament {tournament_id} is not in CRICHEROES_SYNC_TOURNAMENT_IDS",
        )
    if not configured:
        raise HTTPException(
            status_code=422,
            detail="No tournaments to refresh: set CRICHEROES_SYNC_TOURNAMENT_IDS",
        )
    ids = [tournament_id] if tournament_id is not None else configured
    try:
        reports = await cricheroes_cache.sync(client, ids, force=force)
    except CricHeroesError as exc:
        raise _to_http_error(exc) from exc
    return RefreshResponse(reports=reports)
