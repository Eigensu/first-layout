import pymongo
import json
from bson import ObjectId

# Using the URL from .env
MONGODB_URL = "mongodb+srv://walleeigensu_db_user:fNJrnkHMUrQNglWx@walle-fantasy.3rv66oh.mongodb.net/?retryWrites=true&w=majority&appName=Walle-Fantasy"
DB_NAME = "tyrant"

from datetime import datetime

class JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)

def fetch_data():
    try:
        client = pymongo.MongoClient(MONGODB_URL)
        db = client[DB_NAME]
        
        print(f"Connected to database: {DB_NAME}")
        
        # 1. Search for user by full_name
        user_query = {"full_name": {"$regex": "^nisarg doshi$", "$options": "i"}}
        user = db.users.find_one(user_query)
        
        if not user:
            # Try username?
            user_query = {"username": {"$regex": "^nisarg doshi$", "$options": "i"}}
            user = db.users.find_one(user_query)
            
        if user:
            print(f"User found: {user.get('full_name')} (@{user.get('username')}) [ID: {user.get('_id')}]")
            
            # 2. Search for team by user_id and team_name
            team_query = {
                "user_id": user['_id'],
                "team_name": {"$regex": "^dark knight riders$", "$options": "i"}
            }
            team = db.teams.find_one(team_query)
            
            if not team:
                # Search for any team by this user
                print("Specific team name not found, searching for any teams by this user...")
                teams = list(db.teams.find({"user_id": user['_id']}))
                if teams:
                    print(f"Found {len(teams)} teams for user.")
                    print(json.dumps(teams, indent=2, cls=JSONEncoder))
                else:
                    print("No teams found for this user.")
            else:
                print("Team found:")
                print(json.dumps(team, indent=2, cls=JSONEncoder))
                
                # If there are player_ids, maybe fetch player details too?
                if 'player_ids' in team and team['player_ids']:
                    print("\nFetching player details...")
                    # player_ids are strings in the model
                    players = list(db.players.find({"_id": {"$in": [ObjectId(pid) if len(pid)==24 else pid for pid in team['player_ids']]}}))
                    print(f"Found {len(players)} players.")
                    # Show a summary of players
                    for p in players:
                        suffix = ""
                        if str(p['_id']) == team.get('captain_id'): suffix = " (C)"
                        if str(p['_id']) == team.get('vice_captain_id'): suffix = " (VC)"
                        print(f"- {p.get('name')} [{p.get('role')}] {suffix}")

        else:
            print("User 'Nisarg doshi' not found.")
            # Search for the team name directly in case the name is slightly different
            print("\nSearching for team 'Dark Knight riders' directly...")
            team = db.teams.find_one({"team_name": {"$regex": "^dark knight riders$", "$options": "i"}})
            if team:
                print("Team found by name:")
                print(json.dumps(team, indent=2, cls=JSONEncoder))
                # Now find the user
                owner = db.users.find_one({"_id": team['user_id']})
                if owner:
                    print(f"Team owner: {owner.get('full_name')} (@{owner.get('username')})")
            else:
                print("Team 'Dark Knight riders' not found.")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fetch_data()
