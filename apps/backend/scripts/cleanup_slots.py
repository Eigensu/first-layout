import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
import os
import sys
from dotenv import load_dotenv

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

# Load .env from root directory
root_env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
load_dotenv(dotenv_path=root_env_path)

from app.models.admin.slot import Slot

async def main():
    # Use standard dev URI or env var
    mongo_uri = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    print(f"Connecting to MongoDB at: {mongo_uri}")
    client = AsyncIOMotorClient(mongo_uri)
    
    # We'll use the walle_arena DB as default for local dev
    db_name = os.environ.get("MONGODB_DB_NAME", "walle_arena")
    db = client[db_name]
    
    await init_beanie(database=db, document_models=[Slot])
    
    slots = await Slot.find_all().to_list()
    print(f"Total slots in database: {len(slots)}")
    
    # Group by normalized code
    slots_by_code = {}
    for slot in slots:
        normalized_code = slot.code.upper().strip()
        if normalized_code not in slots_by_code:
            slots_by_code[normalized_code] = []
        slots_by_code[normalized_code].append(slot)
    
    slots_to_delete = []
    
    for code, group in slots_by_code.items():
        if len(group) > 1:
            print(f"Found {len(group)} slots for code '{code}'")
            # Sort by creation time, oldest first
            group.sort(key=lambda s: s.created_at)
            
            # Keep the oldest one (index 0)
            keeper = group[0]
            print(f"  -> Keeping: {keeper.id} (created: {keeper.created_at})")
            
            # Mark the rest for deletion
            for duplicate in group[1:]:
                # print(f"  -> Deleting duplicate: {duplicate.id} (created: {duplicate.created_at})")
                slots_to_delete.append(duplicate)
    
    if not slots_to_delete:
        print("\nNo duplicates found!")
        return
        
    print(f"\nTotal duplicates to delete: {len(slots_to_delete)}")
    
    # Auto delete for this script execution to prevent blocking
    confirm = 'y'
    if confirm.lower() == 'y':
        deleted_count = 0
        for slot in slots_to_delete:
            await slot.delete()
            deleted_count += 1
        print(f"Successfully deleted {deleted_count} duplicate slots.")
    else:
        print("Aborted deletion.")

if __name__ == "__main__":
    asyncio.run(main())
