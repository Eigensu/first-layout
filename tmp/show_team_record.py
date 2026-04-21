import pymongo
import json
from bson import ObjectId
from datetime import datetime

MONGODB_URL = "mongodb+srv://walleeigensu_db_user:fNJrnkHMUrQNglWx@walle-fantasy.3rv66oh.mongodb.net/?retryWrites=true&w=majority&appName=Walle-Fantasy"
DB_NAME = "tyrant"

class JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)

def show_team_record():
    client = pymongo.MongoClient(MONGODB_URL)
    db = client[DB_NAME]
    
    team_id = ObjectId("69c23875b610e077350bc639")
    team = db.teams.find_one({"_id": team_id})
    
    if team:
        print(json.dumps(team, indent=2, cls=JSONEncoder))
    else:
        print("Record not found.")

if __name__ == "__main__":
    show_team_record()
