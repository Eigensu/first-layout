import asyncio
import logging
import httpx
from pymongo import UpdateOne
from pymongo.errors import PyMongoError
from app.models.player import Player
from app.models.team import Team
from app.models.contest import Contest
from config.settings import settings
from datetime import datetime, timezone

# Setup logger for the sync service
logger = logging.getLogger("app.services.points_sync")

MVP_SOURCE_URL = settings.mvp_points_source_url
SYNC_TIMEOUT_SECONDS = settings.mvp_points_sync_timeout_seconds
SYNC_INTERVAL_SECONDS = settings.mvp_points_sync_interval_seconds


def _normalize_name(name: str) -> str:
    return " ".join(name.strip().lower().split())


async def _fetch_mvp_points_map() -> dict[str, float]:
    async with httpx.AsyncClient(timeout=SYNC_TIMEOUT_SECONDS) as client:
        response = await client.get(MVP_SOURCE_URL)
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, list):
        raise ValueError("MVP payload must be a list of player objects")

    name_points_map: dict[str, float] = {}
    invalid_count = 0

    for item in payload:
        if not isinstance(item, dict):
            invalid_count += 1
            continue

        raw_name = item.get("name")
        if not isinstance(raw_name, str):
            invalid_count += 1
            continue

        name = _normalize_name(raw_name)
        if not name:
            invalid_count += 1
            continue

        try:
            points = float(item.get("points", 0.0))
        except (TypeError, ValueError):
            invalid_count += 1
            continue

        name_points_map[name] = points

    if invalid_count:
        logger.warning(
            "MVP sync: skipped %s invalid records from source payload.", invalid_count
        )

    return name_points_map


def _build_player_and_contest_updates(
    db_players, active_contests, name_points_map, now
):
    player_bulk = []
    contest_points_bulk = []
    matched_db_names = set()

    for db_p in db_players:
        name_key = _normalize_name(db_p.name)
        if name_key not in name_points_map:
            continue

        new_points = name_points_map[name_key]
        matched_db_names.add(name_key)

        player_bulk.append(
            UpdateOne(
                {"_id": db_p.id}, {"$set": {"points": new_points, "updated_at": now}}
            )
        )

        for contest in active_contests:
            contest_points_bulk.append(
                UpdateOne(
                    {"player_id": db_p.id, "contest_id": contest.id},
                    {"$set": {"points": new_points, "updated_at": now}},
                    upsert=True,
                )
            )

    return player_bulk, contest_points_bulk, matched_db_names


async def sync_player_points():
    """
    Comprehensive sync: Updates global player points, per-contest points, and team totals.
    """
    logger.info("Initiating comprehensive points sync from MVP source...")

    # 1. Fetch data from MVP source
    try:
        name_points_map = await _fetch_mvp_points_map()
    except (httpx.RequestError, httpx.HTTPStatusError, ValueError, TypeError) as exc:
        logger.error(
            "Failed to fetch/parse MVP source data from %s: %s", MVP_SOURCE_URL, exc
        )
        return

    if not name_points_map:
        logger.warning("MVP sync: source payload has no valid player records to sync.")
        return

    # 3. Get necessary data from MongoDB
    db_players = await Player.find_all().to_list()
    active_contests = await Contest.find(Contest.status != "archived").to_list()

    # 4. Prepare updates for Players and Contest Points
    now = datetime.now(timezone.utc)
    player_bulk, contest_points_bulk, matched_db_names = (
        _build_player_and_contest_updates(
            db_players,
            active_contests,
            name_points_map,
            now,
        )
    )

    source_names = set(name_points_map.keys())
    source_only_count = len(source_names - matched_db_names)
    db_only_count = len({_normalize_name(p.name) for p in db_players} - source_names)

    # 5. Execute bulk writes
    if player_bulk:
        # Use motor collection for raw bulk write speed
        raw_db = Player.get_motor_collection().database
        await raw_db.players.bulk_write(player_bulk, ordered=False)

        if contest_points_bulk:
            await raw_db.player_contest_points.bulk_write(
                contest_points_bulk, ordered=False
            )

        logger.info(
            "Sync: Updated %s players across %s active contests.",
            len(player_bulk),
            len(active_contests),
        )

        # 6. Recalculate Team Totals
        # We fetch all teams and sum their player points based on the updated player data
        all_teams = await Team.find_all().to_list()
        team_bulk = []

        # Build lookup for refreshed points
        p_map = {
            str(p.id): float(p.points or 0.0) for p in await Player.find_all().to_list()
        }

        for team in all_teams:
            total = sum(p_map.get(str(pid), 0.0) for pid in team.player_ids)
            team_bulk.append(
                UpdateOne(
                    {"_id": team.id},
                    {"$set": {"total_points": float(total), "updated_at": now}},
                )
            )

        if team_bulk:
            await raw_db.teams.bulk_write(team_bulk, ordered=False)
            logger.info("Sync: Recalculated total points for %s teams.", len(team_bulk))

        logger.info(
            "MVP sync summary: source_records=%s matched_players=%s contest_point_upserts=%s teams_updated=%s source_only=%s db_only=%s",
            len(name_points_map),
            len(player_bulk),
            len(contest_points_bulk),
            len(team_bulk),
            source_only_count,
            db_only_count,
        )
    else:
        logger.warning(
            "MVP sync: No player matches found between source and database names. source_records=%s source_only=%s db_only=%s",
            len(name_points_map),
            source_only_count,
            db_only_count,
        )


async def start_sync_loop():
    """
    Continuously runs the point sync operation every SYNC_INTERVAL_SECONDS.
    """
    logger.info("Starting player points synchronization background task.")
    while True:
        try:
            await sync_player_points()
        except asyncio.CancelledError:
            logger.info("Player points synchronization task cancelled.")
            raise
        except (
            httpx.RequestError,
            httpx.HTTPStatusError,
            ValueError,
            TypeError,
            PyMongoError,
        ) as exc:
            logger.error("Unexpected error in sync loop: %s", exc)

        await asyncio.sleep(SYNC_INTERVAL_SECONDS)
