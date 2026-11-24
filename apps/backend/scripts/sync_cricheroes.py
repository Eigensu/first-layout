"""Refresh the CricHeroes cache (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6.7).

    python scripts/sync_cricheroes.py
    python scripts/sync_cricheroes.py --tournament-id 2242502
    python scripts/sync_cricheroes.py --force

The plain form is the scheduled run, for every CricHeroes tournament a
tournament is linked to in Admin > Tournaments (§13.1) -- nothing to configure
when one is added. Each run reads the match list, one call per tournament;
standings, the MVP table and leaderboards are read again only when a completed
result changed or they are older than CRICHEROES_SNAPSHOT_MAX_AGE_HOURS.
--force reads them all. Every call is counted (§6.6), and the run ends by
logging a warning if this quota term's calls are past
CRICHEROES_USAGE_WARN_PERCENT.

CRICHEROES_SYNC_TOURNAMENT_IDS, when set, is a cap: only the linked tournaments
it names are read, and a run says which linked ones it held back.

For a tournament some contest takes its points from (§9.3), the run also
reads the due match MVP tables and rescores those contests, and prints how
many of each.

Needs MONGODB_URL and the three CRICHEROES_* credentials. Exits 0 when every
tournament refreshed or was current -- a table CricHeroes have no data for yet,
like the MVP table before the first match, is not a failure and is listed under
"no data yet" -- 1 when
anything failed (a resource, a match's MVP table or a contest's scoring) or
the credentials are missing, and
0 with a message when no tournament is linked, so a scheduled service set up
ahead of the first link does not report failures.
"""

import argparse
import asyncio
import logging
import os
import sys

# Ensure the backend package root is importable when running this script directly.
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app.schemas.admin.cricheroes_ops import SyncReport  # noqa: E402
from app.services import cricheroes_cache, cricheroes_usage  # noqa: E402
from app.services.cricheroes_errors import CricHeroesConfigError  # noqa: E402
from config.database import close_mongo_connection, connect_to_mongo  # noqa: E402
from config.observability import flush_observability, setup_observability  # noqa: E402

logger = logging.getLogger("scripts.sync_cricheroes")


def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--tournament-id",
        type=int,
        action="append",
        help="one linked CricHeroes tournament; repeat for more (default: all)",
    )
    parser.add_argument(
        "--force", action="store_true", help="read every resource, changed or not"
    )
    return parser.parse_args(argv)


def summary(report: SyncReport) -> str:
    """What one tournament's run did, each resource named once.

    A table CricHeroes have no data for yet -- the MVP table before the first
    match, say -- is in both `refreshed` and `no_data_yet` (it was one call,
    cached as empty), so it is listed only under "no data yet".
    """
    got = [name for name in report.refreshed if name not in report.no_data_yet]
    parts = [f"{report.calls} call(s)"]
    if got or not report.no_data_yet:
        parts.append(f"refreshed {', '.join(got) or 'nothing'}")
    if report.unchanged:
        parts.append(f"unchanged {', '.join(report.unchanged)}")
    if report.no_data_yet:
        parts.append(f"no data yet for {', '.join(report.no_data_yet)}")
    return "; ".join(parts)


async def run(args: argparse.Namespace) -> int:
    """The run itself, with the database already connected."""
    linked = await cricheroes_cache.linked_tournaments()
    configured = await cricheroes_cache.tournaments_to_sync()
    held_back = [t for t in linked if t not in configured]
    if held_back:
        # Said first, and whatever else happens: a linked tournament that
        # never refreshes is otherwise a mystery.
        print(
            f"Linked but not synced, outside CRICHEROES_SYNC_TOURNAMENT_IDS: "
            f"{held_back}"
        )
    if not configured:
        print(
            "No tournaments to refresh: "
            + (
                "every linked tournament is held back by CRICHEROES_SYNC_TOURNAMENT_IDS."
                if held_back
                else "no tournament is linked to a CricHeroes tournament."
            )
        )
        return 0
    ids = args.tournament_id or configured
    unknown = [t for t in ids if t not in configured]
    if unknown:
        print(
            f"Not synced, as no tournament is linked to them (or "
            f"CRICHEROES_SYNC_TOURNAMENT_IDS holds them back): {unknown}"
        )
        return 1

    async with cricheroes_usage.counted_client() as client:
        try:
            reports = await cricheroes_cache.sync(client, ids, force=args.force)
        except CricHeroesConfigError as exc:
            print(f"FAILED: {exc}")
            logger.error("CricHeroes sync could not start: %s", exc)
            return 1

    # Printed as they come, and logged together at the end, at ERROR, so a
    # failed run shows in PostHog (docs/POSTHOG_OBSERVABILITY.md).
    failures: list[str] = []
    for report in reports:
        if report.skipped:
            print(f"{report.tournament_id}: skipped, {report.skipped}")
            continue
        print(f"{report.tournament_id}: {summary(report)}")
        for resource, error in sorted(report.failed.items()):
            failures.append(f"{report.tournament_id} {resource}: {error}")
            print(f"  FAILED {resource}: {error}")
        # Contest points (spec §9.3); silent for a tournament no contest uses.
        if (
            report.mvp_tables_read
            or report.mvp_tables_failed
            or report.contests_scored
            or report.contests_failed
        ):
            print(
                f"  contest points: read {len(report.mvp_tables_read)} match MVP "
                f"table(s); scored {report.contests_scored} contest(s)"
            )
        for match_id, error in sorted(report.mvp_tables_failed.items()):
            failures.append(
                f"{report.tournament_id} MVP table of match {match_id}: {error}"
            )
            print(f"  FAILED MVP table of match {match_id}: {error}")
        for contest, error in sorted(report.contests_failed.items()):
            failures.append(
                f"{report.tournament_id} scoring contest {contest}: {error}"
            )
            print(f"  FAILED scoring contest {contest}: {error}")

    usage = await cricheroes_usage.usage(days=1)
    print(
        f"Calls this quota term: {usage.calls_this_term} of {usage.quota} "
        f"({usage.percent_used:.1f}%)"
    )
    cricheroes_usage.warn_if_over(usage)
    if failures:
        logger.error("CricHeroes sync failed:\n%s", "\n".join(failures))
    return 1 if failures else 0


async def main(args: argparse.Namespace) -> int:
    # An exception that ends the run is captured on its way out, and sent
    # when the process exits.
    setup_observability("cricheroes-sync")
    await connect_to_mongo()
    try:
        return await run(args)
    finally:
        await close_mongo_connection()
        await asyncio.to_thread(flush_observability)


if __name__ == "__main__":
    sys.exit(asyncio.run(main(parse_args())))
