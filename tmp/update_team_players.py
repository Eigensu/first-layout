import pymongo
from bson import ObjectId

MONGODB_URL = "mongodb+srv://walleeigensu_db_user:fNJrnkHMUrQNglWx@walle-fantasy.3rv66oh.mongodb.net/?retryWrites=true&w=majority&appName=Walle-Fantasy"
DB_NAME = "tyrant"

import datetime

def update_team():
    client = pymongo.MongoClient(MONGODB_URL)
    db = client[DB_NAME]
    
    team_id = ObjectId("69c23875b610e077350bc639")
    old_player_id = "69bd60066007f05dab671827"
    new_player_id = "69bd60066007f05dab671826"
    
    team = db.teams.find_one({"_id": team_id})
    if not team:
        print("Team not found.")
        return

    # Check if old player is in the list
    if old_player_id not in team['player_ids']:
        print(f"Old player ID {old_player_id} not found in team's player list.")
        return

    # Replace the ID
    new_player_ids = [new_player_id if pid == old_player_id else pid for pid in team['player_ids']]
    
    # Update the team document
    result = db.teams.update_one(
        {"_id": team_id},
        {"$set": {"player_ids": new_player_ids, "updated_at": datetime.datetime.utcnow()}}
    )
    
    if result.modified_count > 0:
        print("Successfully updated team player list.")
        print(f"Replaced {old_player_id} with {new_player_id}")
    else:
        print("No changes made to the database.")

if __name__ == "__main__":
    update_team()
