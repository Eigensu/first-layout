"""Phase 1 -- work out which legacy accounts are the same person.

Read-only. Writes a plan for a human to review; merges nothing.

    python scripts/unified_auth/02_build_identity_graph.py --out out/

Produces:
    merge_plan.json    every component, its rows, its edges and its flags
    merge_review.csv   only the flagged ones, for reading in a spreadsheet
    summary.json       the counts, and the gap histogram that sets RECYCLE_GAP

Nothing flagged is merged. Read merge_review.csv before running phase 2.
"""

import argparse
import asyncio
import csv
import json
import os
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(
    0, os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
)

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from scripts.unified_auth.identity_graph import (  # noqa: E402
    build_components,
    summarise,
)
from scripts.unified_auth.loader import (  # noqa: E402
    list_candidate_databases,
    load_rows,
)


def write_plan(components, junk, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    plan = [
        {
            "component_id": f"c{i:06d}",
            "size": c.size,
            "flags": c.flags,
            "auto_merge": c.should_merge and c.size > 1,
            "rows": [
                {
                    "source_db": r.source_db,
                    "legacy_user_id": r.legacy_user_id,
                    "username": r.username,
                    "email": r.email,
                    "mobile": r.mobile,
                    "full_name": r.full_name,
                    "is_admin": r.is_admin,
                    "created_at": r.created_at,
                    "last_login": r.last_login,
                }
                for r in c.rows
            ],
            "edges": [
                {"a": list(e.a), "b": list(e.b), "via": e.via, "value": e.value}
                for e in c.edges
            ],
        }
        for i, c in enumerate(components)
    ]
    (out_dir / "merge_plan.json").write_text(json.dumps(plan, indent=2, default=str))

    with (out_dir / "merge_review.csv").open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            [
                "component_id",
                "flags",
                "size",
                "source_db",
                "legacy_user_id",
                "username",
                "email",
                "mobile",
                "full_name",
                "created_at",
                "last_login",
            ]
        )
        for entry in plan:
            if not entry["flags"]:
                continue
            for row in entry["rows"]:
                writer.writerow(
                    [
                        entry["component_id"],
                        "|".join(entry["flags"]),
                        entry["size"],
                        row["source_db"],
                        row["legacy_user_id"],
                        row["username"],
                        row["email"],
                        row["mobile"],
                        row["full_name"],
                        row["created_at"],
                        row["last_login"],
                    ]
                )

    summary = summarise(components, junk)
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str))
    print(json.dumps(summary, indent=2, default=str))


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", action="append", help="limit to these databases")
    parser.add_argument("--out", type=Path, default=Path("out"))
    parser.add_argument(
        "--recycle-gap-days",
        type=int,
        default=365,
        help="mobile-only matches further apart than this are flagged for review",
    )
    args = parser.parse_args()

    # Imported here, not at module scope: config.settings builds a Settings()
    # on import and requires the real secrets, which would make even --help
    # fail on a machine that has none.
    from config.settings import get_settings

    client = AsyncIOMotorClient(get_settings().mongodb_url)
    try:
        names = args.db or await list_candidate_databases(client)
        rows = await load_rows(client, names)
    finally:
        client.close()

    components, junk = build_components(
        rows, recycle_gap=timedelta(days=args.recycle_gap_days)
    )
    write_plan(components, junk, args.out)
    print(f"\nwrote {args.out}/merge_plan.json, merge_review.csv, summary.json")
    print("Nothing has been merged. Review merge_review.csv before phase 2.")


if __name__ == "__main__":
    asyncio.run(main())
