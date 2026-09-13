"""Phase 0 -- what is actually in the cluster.

Read-only. Run this before anything else: it establishes which database holds
which tournament (Railway redacts MONGODB_DB_NAME to a read-only integration,
so the mapping cannot be read from the service config) and how much data each
phase will have to move.

    python scripts/unified_auth/01_inventory.py --out out/inventory.json
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(
    0, os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
)

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from scripts.unified_auth.loader import (  # noqa: E402
    inventory,
    list_candidate_databases,
)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", action="append", help="limit to these databases")
    parser.add_argument("--out", type=Path, help="write the report as JSON")
    args = parser.parse_args()

    # Imported here, not at module scope: config.settings builds a Settings()
    # on import and requires the real secrets, which would make even --help
    # fail on a machine that has none.
    from config.settings import get_settings

    client = AsyncIOMotorClient(get_settings().mongodb_url)
    try:
        names = args.db or await list_candidate_databases(client)
        report = await inventory(client, names)
    finally:
        client.close()

    width = max(len(n) for n in report) if report else 8
    print(
        f"{'database'.ljust(width)}  {'users':>7} {'w/mobile':>9} {'teams':>7} {'contests':>9} {'avatars':>8}"
    )
    for name, stats in sorted(report.items()):

        def cell(key):
            value = stats.get(key)
            return "-" if value is None else str(value)

        print(
            f"{name.ljust(width)}  {cell('users'):>7} {cell('users_with_mobile'):>9} "
            f"{cell('teams'):>7} {cell('contests'):>9} {cell('avatar_files'):>8}"
        )

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, indent=2, default=str))
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    asyncio.run(main())
