"""Refresh the CricHeroes cache (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6.7).

    python scripts/sync_cricheroes.py
    python scripts/sync_cricheroes.py --tournament-id 2242502
    python scripts/sync_cricheroes.py --force

The plain form is the scheduled run, for every tournament in
CRICHEROES_SYNC_TOURNAMENT_IDS. Each run reads the match list, one call per
tournament; standings, the MVP table and leaderboards are read again only when
a completed result changed or they are older than
CRICHEROES_SNAPSHOT_MAX_AGE_HOURS. --force reads them all. Every call is
counted (§6.6), and the run ends by logging a warning if this quota term's
calls are past CRICHEROES_USAGE_WARN_PERCENT.

Needs MONGODB_URL and the three CRICHEROES_* credentials. Exits 0 when every
tournament refreshed or was current, 1 when anything failed or the
credentials are missing, and 0 with a message when no tournament is
configured, so a scheduled service set up ahead of the configuration does not
report failures.
"""

import argparse
import asyncio
import os
import sys

# Ensure the backend package root is importable when running this script directly.
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app.services import cricheroes_cache, cricheroes_usage  # noqa: E402
from app.services.cricheroes_errors import CricHeroesConfigError  # noqa: E402
from config.database import close_mongo_connection, connect_to_mongo  # noqa: E402
from config.settings import get_settings  # noqa: E402


def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--tournament-id",
        type=int,
        action="append",
        help="one configured CricHeroes tournament; repeat for more (default: all)",
    )
    parser.add_argument(
        "--force", action="store_true", help="read every resource, changed or not"
    )
    return parser.parse_args(argv)


async def run(args: argparse.Namespace) -> int:
    """The run itself, with the database already connected."""
    configured = get_settings().cricheroes_sync_tournaments
    if not configured:
        print("No tournaments to refresh: CRICHEROES_SYNC_TOURNAMENT_IDS is empty.")
        return 0
    ids = args.tournament_id or configured
    unknown = [t for t in ids if t not in configured]
    if unknown:
        print(f"Not in CRICHEROES_SYNC_TOURNAMENT_IDS: {unknown}")
        return 1

    async with cricheroes_usage.counted_client() as client:
        try:
            reports = await cricheroes_cache.sync(client, ids, force=args.force)
        except CricHeroesConfigError as exc:
            print(f"FAILED: {exc}")
            return 1

    failed = False
    for report in reports:
        if report.skipped:
            print(f"{report.tournament_id}: skipped, {report.skipped}")
            continue
        line = (
            f"{report.tournament_id}: {report.calls} call(s); refreshed "
            f"{', '.join(report.refreshed) or 'nothing'}"
        )
        if report.unchanged:
            line += f"; unchanged {', '.join(report.unchanged)}"
        print(line)
        for resource, error in sorted(report.failed.items()):
            failed = True
            print(f"  FAILED {resource}: {error}")

    usage = await cricheroes_usage.usage(days=1)
    print(
        f"Calls this quota term: {usage.calls_this_term} of {usage.quota} "
        f"({usage.percent_used:.1f}%)"
    )
    cricheroes_usage.warn_if_over(usage)
    return 1 if failed else 0


async def main(args: argparse.Namespace) -> int:
    await connect_to_mongo()
    try:
        return await run(args)
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(parse_args())))
