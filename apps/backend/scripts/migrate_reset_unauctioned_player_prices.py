"""
Migration: clear legacy default player prices ahead of auction-purse contests.

`Player.price` used to default to 8.0, so most players carry that value without
anyone having priced them. Auction contests read `price` as the auction sale
value and treat 0 as "never auctioned" (and therefore unavailable), so a stored
8.0 would otherwise read as a near-free buy and undercut the purse.

Slot-based contests never validate against price — it is display-only there —
so zeroing it is safe for existing contests.

By default this resets only players still sitting at exactly the old 8.0
default. Pass --all to zero every price (use when auction values are about to
be imported wholesale and any existing price is meaningless).

Run:  python scripts/migrate_reset_unauctioned_player_prices.py [--all] [--dry-run]
"""

import argparse
import asyncio
import sys
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

# Add parent directory to path to import from app
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.models.admin.player import Player
from config.settings import get_settings

settings = get_settings()

LEGACY_DEFAULT_PRICE = 8.0


async def reset_prices(reset_all: bool, dry_run: bool) -> None:
    client = AsyncIOMotorClient(settings.mongodb_url)
    try:
        await client.admin.command("ping")
        print(f"✓ Connected to MongoDB at {settings.mongodb_url}")

        await init_beanie(
            database=client[settings.mongodb_db_name], document_models=[Player]
        )
        print(f"✓ Initialized Beanie with database: {settings.mongodb_db_name}")

        if reset_all:
            query = {"price": {"$ne": 0}}
            scope = "all players with a non-zero price"
        else:
            query = {"price": LEGACY_DEFAULT_PRICE}
            scope = f"players still at the legacy default of {LEGACY_DEFAULT_PRICE}"

        matched = await Player.find(query).count()
        print(f"Targeting {scope}: {matched} player(s)")

        if matched == 0:
            print("Nothing to do.")
            return

        if dry_run:
            sample = await Player.find(query).limit(10).to_list()
            print("Dry run — would zero the price of, for example:")
            for p in sample:
                print(f"  - {p.name} ({p.team}): {p.price} -> 0.0")
            print(f"Dry run complete. {matched} player(s) would be updated.")
            return

        result = await Player.get_motor_collection().update_many(
            query, {"$set": {"price": 0.0}}
        )
        print(f"✓ Reset price to 0 for {result.modified_count} player(s)")
        print(
            "Import auction values before creating an auction-purse contest; "
            "players left at 0 are excluded from the auction pool."
        )

    finally:
        client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--all",
        action="store_true",
        dest="reset_all",
        help="Zero every non-zero price, not just the legacy 8.0 default",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would change without writing",
    )
    args = parser.parse_args()
    asyncio.run(reset_prices(reset_all=args.reset_all, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
