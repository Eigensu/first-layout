import asyncio
import logging
import httpx
from pymongo import UpdateOne
from app.models.player import Player
from datetime import datetime

# Setup logger for the sync service
logger = logging.getLogger("app.services.points_sync")

# Direct Firebase URL extracted from the worker source for reliability
FIREBASE_URL = "https://exquisitepremierleague-8da3a-default-rtdb.asia-southeast1.firebasedatabase.app/tournaments.json"
SYNC_INTERVAL_SECONDS = 300  # 5 minutes


def calculate_points(p):
    """
    Replicates the point calculation logic from the original MVP worker script.
    Formula: ((Balls)/2) + ((Runs+Bonus)*2) + (NotOuts*15) + (Wickets*25) - (Economy*5) + (Fielding*5)
    """
    stats = p.get("stats", {})
    if not stats:
        return 0.0

    # Extract stats with defaults
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

    # 1. Batting & Basic Bowling points
    points = (float(bat_balls) / 2.0) + \
             ((float(bat_runs) + float(bat_bonus)) * 2.0) + \
             (float(bat_not_outs) * 15.0) + \
             (float(ball_wickets) * 25.0)
             
    # 2. Economy penalty: ((Runs / Balls) * 6) * 5
    if ball_balls > 0:
        points -= ((float(ball_runs) / float(ball_balls)) * 6.0) * 5.0
        
    # 3. Fielding points (5 per action)
    points += (float(field_catches) * 5.0) + \
              (float(field_cb) * 5.0) + \
              (float(field_runouts) * 5.0) + \
              (float(field_stumping) * 5.0)
              
    return round(points, 2)


async def sync_player_points():
    """
    Fetches raw tournament data from Firebase and calculates points for each player.
    """
    logger.info("Initiating player points sync from Firebase database...")
    
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

    bulk_operations = []
    processed_players = 0
    
    # tournaments structure: {"kids": {"players": {...}}, "mens": {...}, ...}
    for category in tournaments.values():
        if not isinstance(category, dict):
            continue
            
        players_dict = category.get("players", {})
        if not isinstance(players_dict, dict):
            continue
            
        for p in players_dict.values():
            name = p.get("name")
            if not name:
                continue
                
            points = calculate_points(p)
            processed_players += 1
            
            bulk_operations.append(
                UpdateOne(
                    {"name": name},
                    {"$set": {
                        "points": points,
                        "updated_at": datetime.utcnow()
                    }}
                )
            )

    if not bulk_operations:
        logger.warning("No valid player data found in Firebase to sync.")
        return

    try:
        collection = Player.get_motor_collection()
        result = await collection.bulk_write(bulk_operations, ordered=False)
        logger.info(f"Points sync completed. Processed: {processed_players}, Matched: {result.matched_count}, Modified: {result.modified_count}")
    except Exception as exc:
        logger.error(f"Failed to perform bulk database update: {exc}")


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
