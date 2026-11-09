"""Seed the unified database's tournament registry -- run before phase 2.

    python scripts/unified_auth/seed_registry.py --apply

Phase 2 refuses to run until every source database has a registry row, the
retired ones included, or memberships would point at ids with no name. This
writes those fifteen rows (spec §7, Source mapping): the two live tournaments
copied from Dcpl's registry, which already holds both, and the thirteen retired
ones as archived rows. Dcpl's archived `tests` tournament is not one of them.

Defaults to a dry run. Re-runnable: a row is inserted if its slug is missing,
rewritten if it differs from what is defined here, and otherwise left alone.
Because it rewrites, run it before cutover, not once admins edit the registry.
"""

import argparse
import asyncio
import os
import sys
from datetime import datetime
from typing import NamedTuple

sys.path.insert(
    0, os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
)

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from app.common.datetime_utils import utc_now  # noqa: E402
from app.common.enums.tournaments import TournamentStatus  # noqa: E402
from scripts.unified_auth.destination import refuse_source_as_destination  # noqa: E402

# The registry the two live tournaments are copied from.
LIVE_REGISTRY_DB = "Dcpl"

# source database -> (slug, name). Copied from LIVE_REGISTRY_DB except the
# name: Dcpl's row reads "DPCL" and rspl's misspells the league, so both are
# named as their contests spell them (decided 2026-10-17).
LIVE = {
    "Dcpl": ("dcpl", "DCPL"),
    "rspl": ("rspl", "Reliance Surfaces Sanskriti Premier League"),
}


class Retired(NamedTuple):
    source_db: str
    slug: str
    name: str
    start_at: datetime
    end_at: datetime


# Names from spec §7. Each window runs from the first real contest's start to
# the last one's end, as the contests store them; contests named "test" are
# left out. world_tower holds WTPL seasons 7 and 8, so its window spans both.
# None has a logo: no image_url in tournament_aggregator is one.
RETIRED = [
    Retired(
        "walle_fantasy",
        "tpl-s11",
        "TPL Season 11",
        datetime(2025, 10, 30, 4, 30),
        datetime(2025, 11, 20, 17, 30),
    ),
    Retired(
        "mwpl",
        "mwpl",
        "MWPL",
        datetime(2025, 12, 14, 2, 30),
        datetime(2025, 12, 14, 16, 30),
    ),
    Retired(
        "lodha-park",
        "lpcl",
        "Lodha Park",
        datetime(2026, 1, 9, 18, 31),
        datetime(2026, 2, 1, 18, 29),
    ),
    Retired(
        "melangeindia11",
        "m11",
        "Melange Team11",
        datetime(2026, 1, 10, 18, 31),
        datetime(2026, 1, 11, 18, 29),
    ),
    Retired(
        "mtc-intervillage",
        "mtc",
        "MTC Marudha Cup",
        datetime(2026, 1, 9, 10, 0),
        datetime(2026, 1, 11, 18, 0),
    ),
    Retired(
        "world_tower",
        "wtpl",
        "World Towers Premier League",
        datetime(2025, 11, 7, 10, 30),
        datetime(2026, 3, 1, 17, 0),
    ),
    Retired(
        "jypl",
        "jypl-s9",
        "JYPL Season 9",
        datetime(2026, 3, 5, 10, 0),
        datetime(2026, 3, 8, 17, 0),
    ),
    Retired(
        "cccl",
        "cccl",
        "Colaba Cricket Club",
        datetime(2026, 3, 16, 1, 30),
        datetime(2026, 4, 12, 17, 30),
    ),
    Retired(
        "mjpl",
        "mjpl",
        "Mewad Jain Premier League",
        datetime(2026, 3, 29, 0, 30),
        datetime(2026, 3, 29, 18, 29),
    ),
    Retired(
        "tyrant",
        "tyrant",
        "Tyrant",
        datetime(2026, 3, 24, 11, 30),
        datetime(2026, 4, 18, 18, 29),
    ),
    Retired(
        "jmcl",
        "jmcl",
        "JMCL",
        datetime(2026, 4, 4, 4, 0),
        datetime(2026, 4, 5, 18, 29),
    ),
    Retired(
        "epl",
        "epl",
        "EPL",
        datetime(2026, 4, 25, 1, 30),
        datetime(2026, 5, 17, 16, 45),
    ),
    Retired(
        "jpl",
        "jpl",
        "JPL",
        datetime(2026, 5, 2, 4, 0),
        datetime(2026, 5, 3, 4, 0),
    ),
]

# The registry fields a row is compared and rewritten on (app/models/tournament.py).
FIELDS = (
    "slug",
    "name",
    "description",
    "logo_url",
    "status",
    "start_at",
    "end_at",
    "primary_color",
    "secondary_color",
    "api_base_url",
)


def mapping() -> dict:
    """source database -> slug: the --map every later phase takes."""
    out = {db: slug for db, (slug, _) in LIVE.items()}
    out.update({r.source_db: r.slug for r in RETIRED})
    return out


async def planned_rows(client) -> list:
    rows = []
    registry = client[LIVE_REGISTRY_DB]["tournaments"]
    for slug, name in LIVE.values():
        live = await registry.find_one({"slug": slug})
        if not live:
            raise SystemExit(f"{LIVE_REGISTRY_DB}.tournaments has no {slug!r} to copy")
        row = {field: live.get(field) for field in FIELDS}
        row.update(name=name, _id=live["_id"], created_at=live.get("created_at"))
        rows.append(row)
    for retired in RETIRED:
        row = dict.fromkeys(FIELDS)
        row.update(
            slug=retired.slug,
            name=retired.name,
            status=TournamentStatus.ARCHIVED.value,
            start_at=retired.start_at,
            end_at=retired.end_at,
        )
        rows.append(row)
    return rows


async def seed(client, dest, apply: bool, now: datetime) -> dict:
    """Bring dest's registry in line with the rows above; slug -> outcome."""
    refuse_source_as_destination(dest.name, mapping())
    outcomes = {}
    for row in await planned_rows(client):
        wanted = {field: row[field] for field in FIELDS}
        existing = await dest["tournaments"].find_one({"slug": row["slug"]})
        if existing is None:
            outcomes[row["slug"]] = "insert"
            if apply:
                await dest["tournaments"].insert_one(
                    {
                        **row,
                        "created_at": row.get("created_at") or now,
                        "updated_at": now,
                    }
                )
        elif any(existing.get(field) != value for field, value in wanted.items()):
            outcomes[row["slug"]] = "update"
            if apply:
                await dest["tournaments"].update_one(
                    {"_id": existing["_id"]}, {"$set": {**wanted, "updated_at": now}}
                )
        else:
            outcomes[row["slug"]] = "unchanged"
    return outcomes


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    from config.settings import get_settings

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    try:
        outcomes = await seed(
            client, client[settings.mongodb_db_name], args.apply, utc_now()
        )
    finally:
        client.close()

    for slug, outcome in outcomes.items():
        print(f"{outcome:<9} {slug}")
    maps = " ".join(f"--map {db}={slug}" for db, slug in mapping().items())
    print(f"\nThe --map for every later phase:\n{maps}")
    if not args.apply:
        print("\nDry run -- nothing was written. Re-run with --apply.")


if __name__ == "__main__":
    asyncio.run(main())
