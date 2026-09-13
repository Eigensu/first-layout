"""Phase 6 -- pick up what changed while the backfill was running.

    python scripts/unified_auth/07_resync_delta.py --since 2026-09-13T02:00:00 \
        --map walle_lpcl=lpcl --apply

The backfill reads a live database, so anyone who signed up or played during it
is missing from the unified one. This re-runs phases 2 and 3 restricted to rows
touched since a timestamp, during the short read-only window at cutover.

Idempotent by construction: rows already in user_id_map are skipped, and game
documents are upserted by their preserved _id, so re-running is safe and a
partial run can simply be run again.
"""

import argparse
import asyncio
import os
import subprocess
import sys
from datetime import datetime

sys.path.insert(
    0, os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
)

HERE = os.path.dirname(__file__)


async def count_stragglers(client, db_names, since: datetime) -> dict:
    counts = {}
    for name in db_names:
        counts[name] = {
            "users": await client[name]["users"].count_documents(
                {
                    "$or": [
                        {"created_at": {"$gte": since}},
                        {"updated_at": {"$gte": since}},
                    ]
                }
            ),
            "teams": await client[name]["teams"].count_documents(
                {
                    "$or": [
                        {"created_at": {"$gte": since}},
                        {"updated_at": {"$gte": since}},
                    ]
                }
            ),
        }
    return counts


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--since", required=True, help="ISO timestamp the backfill started"
    )
    parser.add_argument("--map", action="append", required=True, help="sourcedb=slug")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    since = datetime.fromisoformat(args.since)
    pairs = dict(p.split("=", 1) for p in args.map)

    from motor.motor_asyncio import AsyncIOMotorClient

    from config.settings import get_settings

    client = AsyncIOMotorClient(get_settings().mongodb_url)
    try:
        counts = await count_stragglers(client, list(pairs), since)
    finally:
        client.close()

    print(f"changed since {since.isoformat()}:")
    for db_name, stats in counts.items():
        print(f"  {db_name}: {stats['users']} users, {stats['teams']} teams")

    if not any(s["users"] or s["teams"] for s in counts.values()):
        print("\nNothing to re-sync.")
        return

    # Rather than a second, subtly different import path -- which is how a
    # delta run ends up behaving unlike the backfill it is completing -- this
    # re-runs the real phases. Both are idempotent, so the rows already
    # imported are skipped and only the stragglers are written.
    for phase, extra in (
        ("03_apply_merges.py", [a for m in args.map for a in ("--map", m)]),
        *[
            ("04_import_tenant_data.py", ["--db", db, "--slug", slug])
            for db, slug in pairs.items()
        ],
    ):
        cmd = [sys.executable, os.path.join(HERE, phase), *extra]
        if args.apply:
            cmd.append("--apply")
        print(f"\n$ {' '.join(cmd)}")
        subprocess.run(cmd, check=True)

    if not args.apply:
        print("\nDry run -- nothing was written. Re-run with --apply.")


if __name__ == "__main__":
    asyncio.run(main())
