import asyncio
import logging
import httpx
from pymongo import UpdateOne
from app.models.player import Player

# Setup logger for the sync service
logger = logging.getLogger("app.services.points_sync")
# Standard configuration typically ensures basic logging will surface
# but we explicitly log at error level for failures as requested.

API_URL = "https://epl-score.rsoniprivate.workers.dev/mvp"
SYNC_INTERVAL_SECONDS = 300  # 5 minutes


async def sync_player_points():
    """
    Fetches latest points from the external API and updates the MongoDB players collection
    using bulk write operations for efficiency.
    """
    logger.info("Initiating player points sync from external API...")
    
    # Use httpx AsyncClient with explicit 10 second timeout
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(API_URL)
            response.raise_for_status()
            data = response.json()
        except httpx.TimeoutException:
            logger.error(f"Failed to fetch points: Request to {API_URL} timed out.")
            return
        except httpx.HTTPError as exc:
            logger.error(f"Failed to fetch points: HTTP error occurred - {exc}")
            return
        except Exception as exc:
            logger.error(f"Failed to fetch points: Unexpected error - {exc}")
            return

    # Prepare bulk write operations
    bulk_operations = []
    
    # Expected JSON format: [{"name": "Janak Doshi", "points": 20}, ...]
    for entry in data:
        player_name = entry.get("name")
        player_points = entry.get("points")
        
        # Ensure data is valid before queuing update
        if player_name and player_points is not None:
            try:
                # Make sure points is a float as defined in the Player model
                points_float = float(player_points)
                
                # Create an UpdateOne operation for each player found by exact name
                bulk_operations.append(
                    UpdateOne(
                        {"name": player_name},
                        {"$set": {"points": points_float}}
                    )
                )
            except ValueError:
                # If points aren't a valid number, log and skip
                logger.warning(f"Invalid points format for player {player_name}: {player_points}")
                continue

    if not bulk_operations:
        logger.warning("No valid player points data found to update.")
        return

    # Execute bulk operations using Motor's underlying collection from Beanie
    try:
        collection = Player.get_motor_collection()
        result = await collection.bulk_write(bulk_operations, ordered=False)
        logger.info(f"Points sync completed successfully. Matched: {result.matched_count}, Modified: {result.modified_count}")
    except Exception as exc:
        logger.error(f"Failed to perform bulk database update for player points: {exc}")


async def start_sync_loop():
    """
    Continuously runs the point sync operation every SYNC_INTERVAL_SECONDS.
    Designed to be run as an asyncio background task.
    """
    logger.info("Starting player points synchronization background task.")
    while True:
        try:
            await sync_player_points()
        except asyncio.CancelledError:
            # Handle standard cancellation gracefully
            logger.info("Player points synchronization task cancelled.")
            break
        except Exception as exc:
            # Catch all other exceptions to prevent the loop from dying completely
            logger.error(f"Unexpected error in sync loop: {exc}")
        
        # Sleep until next sync iteration
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)
