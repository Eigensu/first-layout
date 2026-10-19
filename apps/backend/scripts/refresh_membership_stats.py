"""Refresh membership numbers and repair missing rows (spec §6.2a).

    python scripts/refresh_membership_stats.py --all-live
    python scripts/refresh_membership_stats.py --tournament rspl
    python scripts/refresh_membership_stats.py --all

--all-live is the scheduled run. Run --tournament once more after a
tournament completes: its numbers are final from then on, and --all-live
stops touching it. --all is for cutover: the migration writes every
membership with zeros, and this fills them in, past tournaments included.

Shared backend only (TENANCY=shared). A legacy single-tournament database
has no memberships to refresh.
"""

import argparse
import asyncio
import os
import sys

# Ensure the backend package root is importable when running this script directly.
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app.common.enums.tournaments import TournamentStatus  # noqa: E402
from app.models.tournament import Tournament  # noqa: E402
from app.services.membership_stats import refresh_tournament  # noqa: E402
from config.database import close_mongo_connection, connect_to_mongo  # noqa: E402
from config.settings import settings  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    which = parser.add_mutually_exclusive_group(required=True)
    which.add_argument(
        "--all-live", action="store_true", help="every tournament that is live"
    )
    which.add_argument(
        "--all", action="store_true", help="every tournament, archived included"
    )
    which.add_argument(
        "--tournament",
        action="append",
        metavar="SLUG",
        help="one tournament, by slug; repeat for more",
    )
    return parser.parse_args()


async def main(args: argparse.Namespace) -> int:
    if not settings.shared_tenancy:
        print("Memberships exist only on the shared backend: set TENANCY=shared.")
        return 2

    await connect_to_mongo()
    try:
        if args.all_live:
            tournaments = await Tournament.find(
                Tournament.status == TournamentStatus.LIVE
            ).to_list()
        elif args.all:
            tournaments = await Tournament.find_all().to_list()
        else:
            tournaments = []
            for slug in args.tournament:
                tournament = await Tournament.find_one(Tournament.slug == slug)
                if tournament is None:
                    print(f"No tournament with slug {slug!r}")
                    return 1
                tournaments.append(tournament)

        for tournament in tournaments:
            report = await refresh_tournament(tournament)
            print(
                f"{report.slug}: {report.members} members refreshed, "
                f"{report.created} missing rows created"
            )
        if not tournaments:
            print("No tournaments to refresh.")
    finally:
        await close_mongo_connection()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(parse_args())))
