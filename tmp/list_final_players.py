import pymongo
from bson import ObjectId

MONGODB_URL = "mongodb+srv://walleeigensu_db_user:fNJrnkHMUrQNglWx@walle-fantasy.3rv66oh.mongodb.net/?retryWrites=true&w=majority&appName=Walle-Fantasy"
DB_NAME = "tyrant"

def list_players():
    client = pymongo.MongoClient(MONGODB_URL)
    db = client[DB_NAME]
    
    team_id = ObjectId("69c23875b610e077350bc639")
    team = db.teams.find_one({"_id": team_id})
    
    if not team:
        print("Team not found.")
        return
        
    player_ids = team.get('player_ids', [])
    captain_id = team.get('captain_id')
    vice_captain_id = team.get('vice_captain_id')
    
    # Map IDs to names
    players = list(db.players.find({"_id": {"$in": [ObjectId(pid) for pid in player_ids]}}))
    players_dict = {str(p['_id']): p.get('name', 'Unknown') for p in players}
    
    print(f"Players in {team['team_name']}:")
    for pid in player_ids:
        name = players_dict.get(pid, f"Unknown (ID: {pid})")
        suffix = ""
        if pid == captain_id: suffix = " (Captain)"
        elif pid == vice_captain_id: suffix = " (Vice Captain)"
        print(f"- {name}{suffix}")

if __name__ == "__main__":
    list_players()
