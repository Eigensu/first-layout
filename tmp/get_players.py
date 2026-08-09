import pymongo
import json
from bson import ObjectId

MONGODB_URL = "mongodb+srv://walleeigensu_db_user:fNJrnkHMUrQNglWx@walle-fantasy.3rv66oh.mongodb.net/?retryWrites=true&w=majority&appName=Walle-Fantasy"
DB_NAME = "tyrant"

def get_player_names():
    client = pymongo.MongoClient(MONGODB_URL)
    db = client[DB_NAME]
    
    player_ids = [
        "69bd5ff56007f05dab6717a1", "69bd5ff66007f05dab6717a6", "69bd5ff76007f05dab6717b2",
        "69bd5ff86007f05dab6717b6", "69bd5ffb6007f05dab6717d0", "69bd5ffd6007f05dab6717dc",
        "69bd5ffe6007f05dab6717e7", "69bd5ffd6007f05dab6717e2", "69bd60006007f05dab6717f2",
        "69bd60006007f05dab6717f7", "69bd60036007f05dab67180c", "69bd60036007f05dab67180b",
        "69bd60036007f05dab67180a", "69bd60066007f05dab671827", "69bd60056007f05dab671819",
        "69bd60056007f05dab67181c"
    ]
    
    captain_id = "69bd60036007f05dab67180b"
    vice_captain_id = "69bd60036007f05dab67180c"
    
    players = list(db.players.find({"_id": {"$in": [ObjectId(pid) for pid in player_ids]}}))
    
    print("Players in team DARK KNIGHT RIDERS:")
    for p in players:
        role = p.get('role', 'N/A')
        name = p.get('name', 'N/A')
        pid = str(p['_id'])
        suffix = ""
        if pid == captain_id: suffix = " (Captain)"
        elif pid == vice_captain_id: suffix = " (Vice Captain)"
        print(f"- {name} [{role}]{suffix}")

if __name__ == "__main__":
    get_player_names()
