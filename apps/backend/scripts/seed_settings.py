import asyncio
import os
import sys

# Add the 'app' directory to the path so we can import from it
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config.database import init_db
from app.models.settings import GlobalSettings
from app.utils.timezone import now_ist

async def seed_settings():
    print("Initializing Database connection...")
    await init_db()
    
    print("Seeding GlobalSettings defaults...")
    
    # get_instance creates it if it doesn't exist.
    settings = await GlobalSettings.get_instance()
    
    updated = False
    
    if not hasattr(settings, "min_players_per_team") or settings.min_players_per_team is None:
        settings.min_players_per_team: int = 1
        updated = True
        
    if not hasattr(settings, "max_players_per_team") or settings.max_players_per_team is None:
        settings.max_players_per_team: int = 7
        updated = True
        
    if updated:
        settings.updated_at = now_ist()
        await settings.save()
        print(f"Updated GlobalSettings: min_players_per_team={settings.min_players_per_team}, max_players_per_team={settings.max_players_per_team}.")
    else:
        print(f"GlobalSettings already exists and has correctly configured limits: min_players_per_team={settings.min_players_per_team}, max_players_per_team={settings.max_players_per_team}")

if __name__ == "__main__":
    asyncio.run(seed_settings())
