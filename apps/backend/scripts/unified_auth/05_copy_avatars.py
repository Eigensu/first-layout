"""Phase 4 -- move avatars into the unified database's GridFS bucket.

    python scripts/unified_auth/05_copy_avatars.py --apply

Avatars live in GridFS in the same database as the user, so moving users
without moving these gives every migrated player a broken profile picture.
Reads the plan phase 2 left in `avatar_migration`.

Each file keeps its `_id` and its metadata, so the id phase 2 wrote on the user
is already right, the real content type survives, and a re-run skips files it
already copied (see tenant_import.copy_gridfs_file).
"""

import argparse
import asyncio
import os
import sys
from collections import Counter

sys.path.insert(
    0, os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
)

from bson import ObjectId  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from scripts.unified_auth.tenant_import import copy_gridfs_file  # noqa: E402


async def copy_avatars(client, dest, apply: bool) -> Counter:
    outcomes: Counter = Counter()
    async for plan in dest["avatar_migration"].find({}):
        src = client[plan["source_db"]]
        file_id = ObjectId(plan["file_id"])
        if not apply:
            found = await src["avatars.files"].find_one({"_id": file_id}, {"_id": 1})
            outcomes["to copy" if found else "missing"] += 1
            continue

        outcome = await copy_gridfs_file(src, dest, "avatars", file_id)
        outcomes[outcome] += 1
        if outcome == "missing":
            # A dangling avatar id is not worth failing the migration over, but
            # pointing the profile at a file that does not exist shows a broken
            # image. Falls back to no picture, which is what that user already
            # sees today.
            await dest["users"].update_one(
                {"_id": plan["user_id"], "avatar_file_id": plan["file_id"]},
                {"$set": {"avatar_file_id": None, "avatar_url": None}},
            )
    return outcomes


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    from config.settings import get_settings

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    try:
        outcomes = await copy_avatars(
            client, client[settings.mongodb_db_name], args.apply
        )
    finally:
        client.close()

    print("avatars: " + ", ".join(f"{k} {v}" for k, v in sorted(outcomes.items())))
    if not args.apply:
        print("Dry run -- nothing was written. Re-run with --apply.")


if __name__ == "__main__":
    asyncio.run(main())
