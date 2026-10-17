"""Phase 3 -- copy one tournament's game data into the unified database.

    python scripts/unified_auth/04_import_tenant_data.py \\
        --db Dcpl --slug dcpl --apply

Copies, tags with tournament_id, and repoints user references through
user_id_map. `_id` is preserved, so references between documents survive
untouched. Also brings the tournament's settings across as its own row, and
the contest logos, sponsor logos and carousel images its documents point at.
Defaults to a dry run.

Re-runnable, which phase 6 relies on: a document this source copied before is
updated in place (import_ledger records where each came from), and one whose
source document has since been deleted is removed.
"""

import argparse
import asyncio
import json
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(
    0, os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
)

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from scripts.unified_auth.tenant_import import (  # noqa: E402
    TENANT_BUCKETS,
    USER_REFERENCE_FIELDS,
    ImportReport,
    copy_gridfs_file,
    foreign_collisions,
    import_collection,
    resolve_enrollment_collisions,
    tournament_settings,
)


async def import_tenant(client, dest, source_db: str, slug: str, apply: bool):
    report = ImportReport(source_db=source_db, tournament_slug=slug)
    src = client[source_db]

    tournament = await dest["tournaments"].find_one({"slug": slug})
    if not tournament:
        raise SystemExit(f"no registry row for slug {slug!r}")
    tournament_id = tournament["_id"]

    user_id_for = {
        (d["source_db"], d["legacy_user_id"]): str(d["user_id"])
        async for d in dest["user_id_map"].find({"source_db": source_db})
    }
    if not user_id_for:
        raise SystemExit(f"no user_id_map entries for {source_db} -- run phase 2 first")

    # Every collection, not only those the source still has: one emptied or
    # dropped since the last run still has copies here to remove.
    collections = list(USER_REFERENCE_FIELDS)

    collisions = await foreign_collisions(src, dest, source_db, collections)
    if collisions:
        raise SystemExit(f"_id collisions found, refusing to import: {collisions}")

    enrollments = [d async for d in src["team_contest_enrollments"].find({})]
    found, demote = resolve_enrollment_collisions(enrollments, user_id_for, source_db)
    report.enrollment_collisions = found

    for collection in collections:
        copied, unmapped, removed = await import_collection(
            src,
            dest,
            source_db,
            collection,
            tournament_id,
            user_id_for,
            demote,
            apply,
        )
        if copied:
            report.copied[collection] = copied
        if unmapped:
            report.unmapped_user_refs[collection] = unmapped
        if removed:
            report.removed[collection] = removed

    source_settings = await src["global_settings"].find_one({"_id": "global"})
    if source_settings and apply:
        row = tournament_settings(source_settings, tournament_id)
        await dest["global_settings"].replace_one({"_id": row["_id"]}, row, upsert=True)
    report.copied["global_settings"] = 1 if source_settings else 0

    for bucket in TENANT_BUCKETS:
        outcomes: Counter = Counter()
        async for record in src[f"{bucket}.files"].find({}, {"_id": 1}):
            if apply:
                outcomes[await copy_gridfs_file(src, dest, bucket, record["_id"])] += 1
            else:
                outcomes["to copy"] += 1
        if outcomes:
            report.files[bucket] = dict(outcomes)

    return report


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, help="source database")
    parser.add_argument("--slug", required=True, help="tournament slug")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--out", type=Path, default=Path("out"))
    args = parser.parse_args()

    from config.settings import get_settings

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    try:
        report = await import_tenant(
            client, client[settings.mongodb_db_name], args.db, args.slug, args.apply
        )
    finally:
        client.close()

    summary = {
        "mode": "apply" if args.apply else "dry-run",
        "source_db": report.source_db,
        "tournament": report.tournament_slug,
        "copied": report.copied,
        "removed": report.removed,
        "files": report.files,
        "unmapped_user_refs": report.unmapped_user_refs,
        "enrollment_collisions": [vars(c) for c in report.enrollment_collisions],
    }
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / f"import_{args.slug}.json").write_text(
        json.dumps(summary, indent=2, default=str)
    )
    print(json.dumps(summary, indent=2, default=str))

    if report.unmapped_user_refs:
        print("\nWARNING: documents point at accounts the merge did not produce.")
        print("That is a verification failure, not a rounding error. Stop here.")
    if report.enrollment_collisions:
        print(
            f"\n{len(report.enrollment_collisions)} contests had two teams from one merged"
        )
        print("account. The most recent stayed active; the rest are REMOVED. This is")
        print("the one place the merge takes something away -- tell those users.")
    if not args.apply:
        print("\nDry run -- nothing was written. Re-run with --apply.")


if __name__ == "__main__":
    asyncio.run(main())
