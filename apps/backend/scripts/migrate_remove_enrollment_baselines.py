import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import asyncio
from datetime import datetime

from config.database import close_mongo_connection, connect_to_mongo, get_database


async def migrate() -> None:
    db = get_database()
    col = db["team_contest_enrollments"]

    # Unset legacy baseline fields from all documents
    result = await col.update_many(
        {}, {"$unset": {"initial_points": "", "player_initial_points": ""}}
    )
    print(
        f"[MIGRATION] unset initial_points/player_initial_points -> matched={result.matched_count}, modified={result.modified_count}"
    )


async def main() -> None:
    await connect_to_mongo()
    try:
        await migrate()
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(main())
