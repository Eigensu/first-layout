import os
import sys

# Add backend directory to sys.path to import app modules
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
sys.path.append(backend_dir)

from config.settings import get_settings
from app.utils.security import get_password_hash
from pymongo import MongoClient

def main():
    settings = get_settings()
    mobile_number = "9820561284"
    new_password = "Password123!"
    
    print(f"Connecting to MongoDB database: {settings.mongodb_db_name}")
    client = MongoClient(settings.mongodb_url)
    db = client[settings.mongodb_db_name]
    users_coll = db["users"]
    
    print(f"Searching for user with mobile number: {mobile_number}")
    user = users_coll.find_one({"mobile": mobile_number})
    
    if not user:
        print(f"Error: User with mobile number {mobile_number} not found.")
        return
        
    print(f"User found: {user.get('username')} ({user.get('email')})")
    
    # Hash the new password
    hashed_password = get_password_hash(new_password)
    
    # Update the user document
    result = users_coll.update_one(
        {"_id": user["_id"]},
        {"$set": {"hashed_password": hashed_password}}
    )
    
    if result.modified_count > 0:
        print(f"Successfully reset password for mobile {mobile_number}.")
        print(f"New password is: {new_password}")
    else:
        print("Password was not updated (it might be the same hash already).")

if __name__ == "__main__":
    main()
