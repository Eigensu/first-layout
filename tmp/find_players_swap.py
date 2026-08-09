import pymongo
from bson import ObjectId

MONGODB_URL = "mongodb+srv://walleeigensu_db_user:fNJrnkHMUrQNglWx@walle-fantasy.3rv66oh.mongodb.net/?retryWrites=true&w=majority&appName=Walle-Fantasy"
DB_NAME = "tyrant"

def find_players():
    client = pymongo.MongoClient(MONGODB_URL)
    db = client[DB_NAME]
    
    # 1. Find Ayushi Ayush Poddar
    old_player = db.players.find_one({"name": {"$regex": "^Ayushi Ayush Poddar$", "$options": "i"}})
    if old_player:
        print(f"Old player found: {old_player['name']} [ID: {old_player['_id']}]")
    else:
        print("Old player 'Ayushi Ayush Poddar' not found.")

    # 2. Find Aayushi Shaival Sheth
    new_player = db.players.find_one({"name": {"$regex": "^Aayushi Shaival Sheth$", "$options": "i"}})
    if new_player:
        print(f"New player found: {new_player['name']} [ID: {new_player['_id']}]")
    else:
        print("New player 'Aayushi Shaival Sheth' not found.")
        # Let's search for similar names
        similar = list(db.players.find({"name": {"$regex": "Shaival", "$options": "i"}}))
        if similar:
            print("Found similar players:")
            for p in similar:
                print(f"- {p['name']} [ID: {p['_id']}]")

if __name__ == "__main__":
    find_players()
