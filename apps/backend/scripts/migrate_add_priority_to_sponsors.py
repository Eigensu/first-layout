"""
Migration: add and backfill `priority` for sponsors, and align unique ordering per group.
- Assigns sequential priorities starting at 1 for featured and non-featured groups separately.
- Ordering source: display_order asc (if >0), else created_at asc.
- Skips sponsors that already have priority > 0.
- Prints a summary and verifies uniqueness per group.
Run: python scripts/migrate_add_priority_to_sponsors.py
"""

import asyncio
import sys
from collections import defaultdict
from pathlib import Path

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

# Add parent directory to path to import from app
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.models.sponsor import Sponsor
from config.settings import get_settings

settings = get_settings()


async def backfill_priorities():
    client = AsyncIOMotorClient(settings.mongodb_url)
    try:
        await client.admin.command("ping")
        print(f"✓ Connected to MongoDB at {settings.mongodb_url}")

        await init_beanie(
            database=client[settings.mongodb_db_name], document_models=[Sponsor]
        )
        print(f"✓ Initialized Beanie with database: {settings.mongodb_db_name}")

        # Load all sponsors
        sponsors = await Sponsor.find({}).to_list()
        print(f"Found {len(sponsors)} sponsors")

        # Partition by featured
        groups = {True: [], False: []}
        for s in sponsors:
            groups[bool(s.featured)].append(s)

        total_updated = 0
        for featured_flag, items in groups.items():
            print(f"\nProcessing group featured={featured_flag} (count={len(items)})")
            # Already having priority > 0 remain in place; others get assigned
            unset = [
                s
                for s in items
                if not isinstance(getattr(s, "priority", 0), int)
                or (s.priority or 0) <= 0
            ]
            keep = [
                s
                for s in items
                if isinstance(getattr(s, "priority", 0), int) and (s.priority or 0) > 0
            ]

            # Sort unset by display_order>0 then created_at
            def sort_key(s: Sponsor):
                d = getattr(s, "display_order", 0) or 0
                return (
                    0 if d > 0 else 1,
                    d if d > 0 else 0,
                    getattr(s, "created_at", 0),
                )

            unset.sort(key=sort_key)

            # Determine used priorities to avoid conflicts
            used = sorted({int(s.priority) for s in keep if getattr(s, "priority", 0)})
            used_set = set(used)
            next_p = max(used) + 1 if used else 1

            # Assign sequentially to unset
            for s in unset:
                # Pick the smallest available >= 1 not in used_set
                p = 1
                while p in used_set:
                    p += 1
                s.priority = p
                used_set.add(p)

            # Persist changes
            for s in unset:
                await s.save()
            total_updated += len(unset)
            print(f"  Updated {len(unset)} priorities (kept {len(keep)})")

            # Verify uniqueness in group
            by_p = defaultdict(int)
            for s in items:
                p = int(getattr(s, "priority", 0) or 0)
                if p > 0:
                    by_p[p] += 1
            dups = [p for p, c in by_p.items() if c > 1]
            if dups:
                print(
                    f"! WARNING: Duplicate priorities detected in featured={featured_flag}: {dups}"
                )
            else:
                print(f"✓ Uniqueness within featured={featured_flag} verified")

        print(f"\n✓ Migration complete. Total sponsors updated: {total_updated}")

    finally:
        client.close()
        print("\n✓ Closed database connection")


if __name__ == "__main__":
    print("\n🚀 Starting migration: add/backfill `priority` for sponsors\n")
    asyncio.run(backfill_priorities())
    print("\n✅ Migration finished")
