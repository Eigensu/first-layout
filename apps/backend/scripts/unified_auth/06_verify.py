"""Phase 5 -- the checks that gate the cutover.

    python scripts/unified_auth/06_verify.py --source walle_lpcl --source walle_fifth

Exits non-zero if anything fails. Nothing is repointed at the unified database
until this is clean.
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(
    0, os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
)

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from scripts.unified_auth.verify import render, verify  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", required=True)
    args = parser.parse_args()

    from config.settings import get_settings

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.mongodb_db_name]

    try:
        expected = 0
        for name in args.source:
            expected += await client[name]["users"].count_documents({})
        result = await verify(db, db, args.source, expected)
    finally:
        client.close()

    print(render(result))
    sys.exit(0 if result.ok else 1)


if __name__ == "__main__":
    asyncio.run(main())
