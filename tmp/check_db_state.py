import pymongo
from bson import ObjectId

MONGODB_URL = "mongodb+srv://walleeigensu_db_user:fNJrnkHMUrQNglWx@walle-fantasy.3rv66oh.mongodb.net/?retryWrites=true&w=majority&appName=Walle-Fantasy"
DB_NAME = "tyrant"

def check_db():
    client = pymongo.MongoClient(MONGODB_URL)
    db = client[DB_NAME]
    
    team = db.teams.find_one({"_id": ObjectId("69c23875b610e077350bc639")})
    print(f"Team: {team['team_name']}")
    
    player_ids = team['player_ids']
    players = list(db.players.find({"_id": {"$in": [ObjectId(pid) for pid in player_ids]}}))
    
    print("\nCurrent Players in DB:")
    for p in players:
        print(f"- {p['name']} [ID: {p['_id']}]")

if __name__ == "__main__":
    check_db()
