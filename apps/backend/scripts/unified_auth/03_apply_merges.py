"""Phase 2 -- write the unified accounts, memberships and id map.

The first phase that writes anything. Nothing in a source database is modified;
everything is written into the unified database, so the whole phase is undone by
dropping what it created.

    python scripts/unified_auth/03_apply_merges.py --map walle_lpcl=lpcl \
        --map walle_fifth=fifth --platform-admins admins.txt --apply

Defaults to a dry run. Idempotent: re-running converges rather than duplicating,
because user_id_map and uniq_legacy_row both reject a row already imported.
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

from bson import ObjectId  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from scripts.unified_auth.identity_graph import build_components  # noqa: E402
from scripts.unified_auth.loader import load_rows  # noqa: E402
from scripts.unified_auth.merge_apply import (  # noqa: E402
    plan_accounts,
    plan_memberships,
)


def parse_map(pairs):
    out = {}
    for pair in pairs or []:
        db, _, slug = pair.partition("=")
        if not db or not slug:
            raise SystemExit(f"--map expects db=slug, got {pair!r}")
        out[db] = slug
    return out


def load_admin_keys(path):
    """Emails and mobiles of people who administer the whole platform.

    Read from a file rather than inferred from legacy is_admin, because merging
    would otherwise hand someone who administered one tournament every
    tournament there has ever been.
    """
    if not path:
        return set()
    return {
        line.strip().lower()
        for line in Path(path).read_text().splitlines()
        if line.strip() and not line.startswith("#")
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map", action="append", required=True, help="sourcedb=slug")
    parser.add_argument(
        "--platform-admins", help="file of emails/mobiles, one per line"
    )
    parser.add_argument("--apply", action="store_true", help="write; otherwise dry run")
    parser.add_argument("--out", type=Path, default=Path("out"))
    args = parser.parse_args()

    slug_by_db = parse_map(args.map)
    admin_keys = load_admin_keys(args.platform_admins)

    from config.settings import get_settings

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    auth_db = client[settings.mongodb_db_name]

    try:
        rows = await load_rows(client, list(slug_by_db))
        components, _ = build_components(rows)

        tournaments = {
            t["slug"]: t["_id"]
            async for t in auth_db["tournaments"].find({}, {"slug": 1})
        }
        missing = set(slug_by_db.values()) - set(tournaments)
        if missing:
            raise SystemExit(
                f"no registry row for {sorted(missing)} -- create the tournaments "
                "first, including the retired ones, or memberships will point at "
                "ids with no name"
            )

        accounts_written = memberships_written = 0
        for i, component in enumerate(components):
            for account in plan_accounts(component, f"c{i:06d}", admin_keys):
                first = account.source_rows[0]
                existing = await auth_db["user_id_map"].find_one(
                    {
                        "source_db": first.source_db,
                        "legacy_user_id": first.legacy_user_id,
                    }
                )
                if existing:
                    continue  # already imported by an earlier run

                user_id = ObjectId()
                if args.apply:
                    doc = {
                        k: v
                        for k, v in vars(account).items()
                        if k not in {"source_rows", "avatar_source_db"}
                    }
                    doc["_id"] = user_id
                    await auth_db["users"].insert_one(doc)
                    for row in account.source_rows:
                        await auth_db["user_id_map"].insert_one(
                            {
                                "source_db": row.source_db,
                                "legacy_user_id": row.legacy_user_id,
                                "user_id": user_id,
                            }
                        )
                    if account.avatar_file_id:
                        await auth_db["avatar_migration"].insert_one(
                            {
                                "user_id": user_id,
                                "source_db": account.avatar_source_db,
                                "file_id": account.avatar_file_id,
                            }
                        )
                accounts_written += 1

                for membership in plan_memberships(account, slug_by_db):
                    if args.apply:
                        await auth_db["tournament_memberships"].insert_one(
                            {
                                "user_id": user_id,
                                "tournament_id": tournaments[
                                    membership.tournament_slug
                                ],
                                "tournament_slug": membership.tournament_slug,
                                "source_db": membership.source_db,
                                "legacy_user_id": ObjectId(membership.legacy_user_id),
                                "display_name": membership.display_name,
                                "role": membership.role,
                                "status": "registered",
                                "joined_at": membership.joined_at,
                                "last_login_at": membership.last_login_at,
                                "stats": {
                                    "teams_count": 0,
                                    "contests_count": 0,
                                    "best_rank": None,
                                    "total_points": 0.0,
                                    "refreshed_at": None,
                                },
                            }
                        )
                    memberships_written += 1
    finally:
        client.close()

    summary = {
        "mode": "apply" if args.apply else "dry-run",
        "legacy_rows": len(rows),
        "components": len(components),
        "accounts": accounts_written,
        "memberships": memberships_written,
        "platform_admins_configured": len(admin_keys),
    }
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "apply_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    if not args.apply:
        print("\nDry run -- nothing was written. Re-run with --apply.")


if __name__ == "__main__":
    asyncio.run(main())
