"""Phase 4 -- move avatars into the unified database's GridFS bucket.

    python scripts/unified_auth/05_copy_avatars.py --apply

Avatars live in GridFS in the same database as the user, so moving users
without moving these gives every migrated player a broken profile picture.
Reads the plan phase 2 left in `avatar_migration`.
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(
    0, os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
)

from bson import ObjectId  # noqa: E402
from motor.motor_asyncio import (  # noqa: E402
    AsyncIOMotorClient,
    AsyncIOMotorGridFSBucket,
)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    from config.settings import get_settings

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    dest = client[settings.mongodb_db_name]
    dest_bucket = AsyncIOMotorGridFSBucket(dest, bucket_name="avatars")

    copied = missing = 0
    try:
        async for plan in dest["avatar_migration"].find({}):
            src_bucket = AsyncIOMotorGridFSBucket(
                client[plan["source_db"]], bucket_name="avatars"
            )
            try:
                stream = await src_bucket.open_download_stream(
                    ObjectId(plan["file_id"])
                )
                data = await stream.read()
            except Exception:
                # A dangling avatar id is not worth failing the migration over;
                # the profile falls back to no picture, which is what that user
                # already sees today.
                missing += 1
                continue

            if args.apply:
                new_id = await dest_bucket.upload_from_stream(
                    f"user_{plan['user_id']}",
                    data,
                    metadata={"content_type": "image/jpeg"},
                )
                await dest["users"].update_one(
                    {"_id": plan["user_id"]},
                    {
                        "$set": {
                            "avatar_file_id": str(new_id),
                            "avatar_url": f"/api/users/{plan['user_id']}/avatar",
                        }
                    },
                )
            copied += 1
    finally:
        client.close()

    print(f"avatars copied: {copied}, unreadable in source: {missing}")
    if not args.apply:
        print("Dry run -- nothing was written. Re-run with --apply.")


if __name__ == "__main__":
    asyncio.run(main())
