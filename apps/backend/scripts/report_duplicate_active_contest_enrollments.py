import asyncio
import argparse
import os
import sys
from typing import Any

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


# Ensure the backend package root is importable when running this script directly.
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

ROOT_ENV_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
)
load_dotenv(dotenv_path=ROOT_ENV_PATH)


async def load_names(collection, ids):
    if not ids:
        return {}
    docs = await collection.find({"_id": {"$in": list(ids)}}).to_list()
    return {str(doc["_id"]): doc for doc in docs}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report duplicate active contest enrollments and optionally archive extras."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Archive duplicate active enrollments after reporting them.",
    )
    return parser.parse_args()


async def archive_duplicates(enrollments, rows):
    archived_count = 0

    for row in rows:
        enrollment_ids = row.get("enrollment_ids", [])
        enrolled_at_values = row.get("enrolled_at_values", [])

        candidates = list(zip(enrollment_ids, enrolled_at_values))
        candidates = [item for item in candidates if item[0]]
        if len(candidates) <= 1:
            continue

        # Keep the newest active enrollment and archive the older ones.
        candidates.sort(
            key=lambda item: (item[1] is None, item[1], str(item[0])), reverse=True
        )
        keep_id = candidates[0][0]
        remove_ids = [enrollment_id for enrollment_id, _ in candidates[1:]]
        if not remove_ids:
            continue

        result = await enrollments.update_many(
            {"_id": {"$in": remove_ids}},
            {
                "$set": {
                    "status": "removed",
                }
            },
        )
        archived_count += int(result.modified_count or 0)
        print(f"  archived {len(remove_ids)} duplicate enrollments; kept {keep_id}")

    return archived_count


async def main() -> None:
    args = parse_args()
    mongo_uri = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("MONGODB_DB_NAME", "walle_arena")

    print(f"Connecting to MongoDB at: {mongo_uri}")
    client = AsyncIOMotorClient(mongo_uri)
    db = client.get_database(db_name)

    enrollments = db["team_contest_enrollments"]
    contests = db["contests"]
    users = db["users"]
    teams = db["teams"]

    pipeline = [
        {"$match": {"status": "active"}},
        {
            "$group": {
                "_id": {"contest_id": "$contest_id", "user_id": "$user_id"},
                "count": {"$sum": 1},
                "enrollment_ids": {"$push": "$_id"},
                "team_ids": {"$push": "$team_id"},
                "enrolled_at_values": {"$push": "$enrolled_at"},
            }
        },
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
    ]

    rows = await enrollments.aggregate(pipeline).to_list(length=None)

    duplicate_groups = len(rows)
    duplicate_enrollments = sum(int(row["count"]) - 1 for row in rows)

    print("\nDuplicate active enrollment summary")
    print(f"  Duplicate contest/user groups: {duplicate_groups}")
    print(f"  Extra active enrollments beyond the first: {duplicate_enrollments}")

    if not rows:
        print("\nNo duplicate active enrollments found.")
        client.close()
        return

    contest_ids = {
        row["_id"]["contest_id"] for row in rows if row.get("_id", {}).get("contest_id")
    }
    user_ids = {
        row["_id"]["user_id"] for row in rows if row.get("_id", {}).get("user_id")
    }
    team_ids = {
        team_id for row in rows for team_id in row.get("team_ids", []) if team_id
    }

    contest_docs = await load_names(contests, contest_ids)
    user_docs = await load_names(users, user_ids)
    team_docs = await load_names(teams, team_ids)

    print("\nDuplicate groups")
    for idx, row in enumerate(rows, start=1):
        contest_id = row["_id"].get("contest_id")
        user_id = row["_id"].get("user_id")
        count = int(row.get("count", 0))
        contest_doc: Any = contest_docs.get(str(contest_id), {})
        user_doc: Any = user_docs.get(str(user_id), {})

        contest_label = (
            contest_doc.get("code") or contest_doc.get("name") or str(contest_id)
        )
        user_label = (
            user_doc.get("username")
            or user_doc.get("full_name")
            or user_doc.get("email")
            or str(user_id)
        )
        team_labels = []
        for team_id in row.get("team_ids", []):
            team_doc: Any = team_docs.get(str(team_id), {})
            team_labels.append(team_doc.get("team_name") or str(team_id))

        print(
            f"  {idx}. contest={contest_label} ({contest_id}) | user={user_label} ({user_id}) | active_teams={count} | teams={', '.join(team_labels)}"
        )

    if args.apply:
        print("\nApplying cleanup: archiving older duplicates...")
        archived_count = await archive_duplicates(enrollments, rows)
        print(f"\nCleanup complete. Archived {archived_count} duplicate enrollments.")
    else:
        print("\nDry run only. Re-run with --apply to archive older duplicates.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
