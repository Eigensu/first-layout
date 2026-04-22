import asyncio
import logging
import httpx
from pymongo import UpdateOne
from app.models.player import Player
from app.models.team import Team
from app.models.player_contest_points import PlayerContestPoints
from app.models.contest import Contest
from datetime import datetime
from beanie import PydanticObjectId

# Setup logger for the sync service
logger = logging.getLogger("app.services.points_sync")

# Direct Firebase URL
FIREBASE_URL = "https://exquisitepremierleague-8da3a-default-rtdb.asia-southeast1.firebasedatabase.app/tournaments.json"
SYNC_INTERVAL_SECONDS = 300  # 5 minutes


def calculate_points(p):
    """
    Replicates the point calculation logic from the original MVP worker script.
    """
    stats = p.get("stats", {})
    if not stats:
        return 0.0

    bat_balls = stats.get("bat_balls", 0) or 0
    bat_runs = stats.get("bat_runs", 0) or 0
    bat_bonus = stats.get("bat_bonus", 0) or 0
    bat_not_outs = stats.get("bat_not_outs", 0) or 0
    
    ball_wickets = stats.get("ball_wickets", 0) or 0
    ball_balls = stats.get("ball_balls", 0) or 0
    ball_runs = stats.get("ball_runs", 0) or 0
    
    field_catches = stats.get("field_catches", 0) or 0
    field_cb = stats.get("field_cb", 0) or 0
    field_runouts = stats.get("field_runouts", 0) or 0
    field_stumping = stats.get("field_stumping", stats.get("field_stumpings", 0)) or 0

    points = (float(bat_balls) / 2.0) + \
             ((float(bat_runs) + float(bat_bonus)) * 2.0) + \
             (float(bat_not_outs) * 15.0) + \
             (float(ball_wickets) * 25.0)
             
    if ball_balls > 0:
        points -= ((float(ball_runs) / float(ball_balls)) * 6.0) * 5.0
        
    points += (float(field_catches) * 5.0) + \
              (float(field_cb) * 5.0) + \
              (float(field_runouts) * 5.0) + \
              (float(field_stumping) * 5.0)
              
    return round(points, 2)


async def sync_player_points():
    """
    Comprehensive sync: Updates global player points, per-contest points, and team totals.
    """
    logger.info("Initiating comprehensive points sync from Firebase...")
    
    # 1. Fetch data from Firebase
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(FIREBASE_URL)
            response.raise_for_status()
            tournaments = response.json()
            if not tournaments:
                logger.warning("Firebase returned empty tournament data.")
                return
        except Exception as exc:
            logger.error(f"Failed to fetch data from Firebase: {exc}")
            return

    # 2. Map Firebase names to calculated points
    name_points_map = {}
    for category in tournaments.values():
        if not isinstance(category, dict):
            continue
        players_dict = category.get("players", {})
        if not isinstance(players_dict, dict):
            continue
        for p in players_dict.values():
            name = p.get("name")
            if name:
                name_points_map[name.strip()] = calculate_points(p)

    if not name_points_map:
        logger.warning("No player data found in Firebase to sync.")
        return

    # 3. Get necessary data from MongoDB
    db_players = await Player.find_all().to_list()
    active_contests = await Contest.find(Contest.status != "archived").to_list()
    
    player_bulk = []
    contest_points_bulk = []
    
    # 4. Prepare updates for Players and Contest Points
    now = datetime.utcnow()
    for db_p in db_players:
        # Match by name (trimmed and case-insensitive)
        name_key = db_p.name.strip()
        if name_key in name_points_map:
            new_points = name_points_map[name_key]
            
            # Global Player update
            player_bulk.append(
                UpdateOne(
                    {"_id": db_p.id},
                    {"$set": {"points": new_points, "updated_at": now}}
                )
            )
            
            # Per-Contest Points update (This fixes the 'Edit by Teams' admin page)
            for contest in active_contests:
                contest_points_bulk.append(
                    UpdateOne(
                        {"player_id": db_p.id, "contest_id": contest.id},
                        {"$set": {"points": new_points, "updated_at": now}},
                        upsert=True
                    )
                )

    # 5. Execute bulk writes
    if player_bulk:
        # Use motor collection for raw bulk write speed
        raw_db = Player.get_motor_collection().database
        await raw_db.players.bulk_write(player_bulk, ordered=False)
        
        if contest_points_bulk:
            await raw_db.player_contest_points.bulk_write(contest_points_bulk, ordered=False)
            
        logger.info(f"Sync: Updated {len(player_bulk)} players across {len(active_contests)} active contests.")

        # 6. Recalculate Team Totals
        # We fetch all teams and sum their player points based on the updated player data
        all_teams = await Team.find_all().to_list()
        team_bulk = []
        
        # Build lookup for refreshed points
        p_map = {str(p.id): p.points for p in await Player.find_all().to_list()}

        for team in all_teams:
            total = sum(p_map.get(pid, 0.0) for pid in team.player_ids)
            team_bulk.append(
                UpdateOne(
                    {"_id": team.id},
                    {"$set": {"total_points": float(total), "updated_at": now}}
                )
            )

        if team_bulk:
            await raw_db.teams.bulk_write(team_bulk, ordered=False)
            logger.info(f"Sync: Recalculated total points for {len(team_bulk)} teams.")
    else:
        logger.warning("Sync: No player matches found between Firebase and Database names.")


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
            break
        except Exception as exc:
            logger.error(f"Unexpected error in sync loop: {exc}")
        
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)
