"""Phase 5 -- the checks that gate the cutover.

    python scripts/unified_auth/06_verify.py --map Dcpl=dcpl --map rspl=rspl ...

The same --map as phase 2. Exits non-zero if anything fails. Nothing is
repointed at the unified database until this is clean.
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
    parser.add_argument("--map", action="append", required=True, help="sourcedb=slug")
    args = parser.parse_args()
    slug_by_db = dict(pair.split("=", 1) for pair in args.map)

    from config.settings import get_settings

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    dest = client[settings.mongodb_db_name]

    try:
        by_slug = {
            t["slug"]: t["_id"] async for t in dest["tournaments"].find({}, {"slug": 1})
        }
        missing = sorted(set(slug_by_db.values()) - set(by_slug))
        if missing:
            raise SystemExit(f"no registry row for {missing}")
        result = await verify(
            dest,
            {name: client[name] for name in slug_by_db},
            {name: by_slug[slug] for name, slug in slug_by_db.items()},
        )
    finally:
        client.close()

    print(render(result))
    sys.exit(0 if result.ok else 1)


if __name__ == "__main__":
    asyncio.run(main())
