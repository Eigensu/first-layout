"""Phase 3 -- copy one tournament's game data into the unified database.

    python scripts/unified_auth/04_import_tenant_data.py \
        --db walle_lpcl --slug lpcl --apply

Copies, tags with tournament_id, and repoints user references through
user_id_map. `_id` is preserved, so references between documents survive
untouched. Defaults to a dry run.

Drop the legacy global unique index on contests.code before running this, or
the first cross-tournament duplicate aborts the import:

    db.contests.dropIndex("code_1")
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

from scripts.unified_auth.tenant_import import (  # noqa: E402
    REMOVED,
    USER_REFERENCE_FIELDS,
    ImportReport,
    find_id_collisions,
    remap_document,
    resolve_enrollment_collisions,
)


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
    dest = client[settings.mongodb_db_name]
    src = client[args.db]

    report = ImportReport(source_db=args.db, tournament_slug=args.slug)

    try:
        tournament = await dest["tournaments"].find_one({"slug": args.slug})
        if not tournament:
            raise SystemExit(f"no registry row for slug {args.slug!r}")
        tournament_id = tournament["_id"]

        user_id_for = {
            (d["source_db"], d["legacy_user_id"]): str(d["user_id"])
            async for d in dest["user_id_map"].find({"source_db": args.db})
        }
        if not user_id_for:
            raise SystemExit(
                f"no user_id_map entries for {args.db} -- run phase 2 first"
            )

        collisions = await find_id_collisions(
            client, [args.db, settings.mongodb_db_name], list(USER_REFERENCE_FIELDS)
        )
        if collisions:
            raise SystemExit(f"_id collisions found, refusing to import: {collisions}")

        enrollments = [d async for d in src["team_contest_enrollments"].find({})]
        found, demote = resolve_enrollment_collisions(enrollments, user_id_for, args.db)
        report.enrollment_collisions = found

        existing = set(await src.list_collection_names())
        for collection in USER_REFERENCE_FIELDS:
            if collection not in existing:
                continue
            copied = unmapped = 0
            async for doc in src[collection].find({}):
                remapped, missed = remap_document(
                    doc, collection, tournament_id, user_id_for, args.db
                )
                if missed:
                    unmapped += 1
                if (
                    collection == "team_contest_enrollments"
                    and str(doc["_id"]) in demote
                ):
                    remapped["status"] = REMOVED
                    remapped["removed_at"] = remapped.get("removed_at")
                    remapped["removal_reason"] = (
                        "superseded by merge (see migration report)"
                    )
                if args.apply:
                    await dest[collection].replace_one(
                        {"_id": remapped["_id"]}, remapped, upsert=True
                    )
                copied += 1
            report.copied[collection] = copied
            if unmapped:
                report.unmapped_user_refs[collection] = unmapped
    finally:
        client.close()

    summary = {
        "mode": "apply" if args.apply else "dry-run",
        "source_db": report.source_db,
        "tournament": report.tournament_slug,
        "copied": report.copied,
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
