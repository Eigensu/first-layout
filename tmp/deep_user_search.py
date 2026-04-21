import pymongo
from bson import ObjectId

MONGODB_URL = "mongodb+srv://walleeigensu_db_user:fNJrnkHMUrQNglWx@walle-fantasy.3rv66oh.mongodb.net/?retryWrites=true&w=majority&appName=Walle-Fantasy"
DB_NAME = "tyrant"

def find_user_full():
    client = pymongo.MongoClient(MONGODB_URL)
    db = client[DB_NAME]
    
    print("Searching for users with 'Nisharg' or 'Nisarg' in name...")
    users = list(db.users.find({"full_name": {"$regex": "Nisarg|Nisharg", "$options": "i"}}))
    
    for u in users:
        print(f"- Full Name: {u.get('full_name')}, Username: @{u.get('username')}, ID: {u.get('_id')}")
        # Find teams for this user
        teams = list(db.teams.find({"user_id": u['_id']}))
        if teams:
            for t in teams:
                print(f"  Team: {t.get('team_name')} (ID: {t.get('_id')})")
        else:
            print("  No teams found.")

if __name__ == "__main__":
    find_user_full()
