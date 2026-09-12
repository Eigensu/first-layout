import os

import pymongo
from pymongo.errors import DuplicateKeyError

OLD_DB_NAME = os.getenv("OLD_DB_NAME", "walle_fantasy")
NEW_DB_NAME = os.getenv("NEW_DB_NAME", "world_tower")
USERS_COLL = os.getenv("USERS_COLL", "users")
MONGO_URL = os.getenv("MONGO_URL")


def main():
    if not MONGO_URL:
        print("Error: MONGO_URL environment variable is not set.")
        return

    client = pymongo.MongoClient(MONGO_URL)
    old_coll = client[OLD_DB_NAME][USERS_COLL]
    new_coll = client[NEW_DB_NAME][USERS_COLL]

    users = list(old_coll.find({}))
    if not users:
        print("No users found in old database.")
        return

    n_inserted = 0
    for user in users:
        try:
            new_coll.insert_one(user)
            n_inserted += 1
        except DuplicateKeyError:
            print(f"Skipping duplicate user with _id: {user.get('_id')}")
        except Exception as e:
            print(f"Error inserting user {user.get('_id')}: {e}")

    print(
        f"Migration complete. Inserted {n_inserted} users into '{NEW_DB_NAME}.{USERS_COLL}'."
    )


if __name__ == "__main__":
    main()
