"""Phase 2 -- write the unified accounts, memberships and id map.

The first phase that writes anything. Nothing in a source database is modified;
everything is written into the unified database, so the whole phase is undone by
dropping what it created.

    python scripts/unified_auth/03_apply_merges.py \\
        --map Dcpl=dcpl --map rspl=rspl --map walle_fantasy=tpl-s11 ... \\
        --copy-of world_tower=walle_fantasy \\
        --platform-admins admins.txt --apply

Defaults to a dry run. Re-runnable: every write is an upsert keyed on what it
describes, and each run rewrites the accounts from the sources, so phase 6 can
run it again to pick up what changed (see apply_accounts.py).

--copy-of declares a database that was seeded with a copy of another's users.
Phase 2 refuses to run if two databases share user ids and neither is declared,
because which one is the original decides who gets a membership.
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

from scripts.unified_auth.apply_accounts import apply_accounts  # noqa: E402
from scripts.unified_auth.destination import refuse_source_as_destination  # noqa: E402
from scripts.unified_auth.identity_graph import build_components  # noqa: E402
from scripts.unified_auth.loader import load_rows, load_team_owners  # noqa: E402
from scripts.unified_auth.merge_apply import (  # noqa: E402
    copies_without_activity,
    plan_accounts,
    undeclared_copies,
)
from scripts.unified_auth.normalise import (  # noqa: E402
    normalise_email,
    normalise_mobile,
)


def parse_pairs(pairs, flag):
    out = {}
    for pair in pairs or []:
        left, _, right = pair.partition("=")
        if not left or not right:
            raise SystemExit(f"{flag} expects a=b, got {pair!r}")
        out[left] = right
    return out


def load_admin_keys(path):
    """Emails and mobiles of people who administer the whole platform.

    Read from a file rather than inferred from legacy is_admin, because merging
    would otherwise hand someone who administered one tournament every
    tournament there has ever been. Normalised exactly as the accounts' keys
    are, or Rahul.Patel@gmail.com in this file would never match the account.
    """
    if not path:
        return set()
    keys = set()
    for line in Path(path).read_text().splitlines():
        value = line.strip()
        if not value or value.startswith("#"):
            continue
        key = normalise_email(value) or normalise_mobile(value)
        if not key:
            raise SystemExit(f"{path}: {value!r} is neither an email nor a mobile")
        keys.add(key)
    return keys


def group_id(component) -> str:
    """Stable across runs, so a review item is updated rather than duplicated."""
    first = component.rows[0]
    return f"{first.source_db}:{first.legacy_user_id}"


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map", action="append", required=True, help="sourcedb=slug")
    parser.add_argument(
        "--copy-of",
        action="append",
        help="copydb=originaldb, for a database seeded from another's users",
    )
    parser.add_argument(
        "--platform-admins", help="file of emails/mobiles, one per line"
    )
    parser.add_argument("--apply", action="store_true", help="write; otherwise dry run")
    parser.add_argument("--out", type=Path, default=Path("out"))
    args = parser.parse_args()

    slug_by_db = parse_pairs(args.map, "--map")
    copy_of = parse_pairs(args.copy_of, "--copy-of")
    for copy, original in copy_of.items():
        if copy not in slug_by_db or original not in slug_by_db:
            raise SystemExit(f"--copy-of {copy}={original}: both must be --map'd")
    admin_keys = load_admin_keys(args.platform_admins)

    from config.settings import get_settings

    settings = get_settings()
    refuse_source_as_destination(settings.mongodb_db_name, slug_by_db)
    client = AsyncIOMotorClient(settings.mongodb_url)
    dest = client[settings.mongodb_db_name]

    try:
        rows = await load_rows(client, list(slug_by_db))
        undeclared = undeclared_copies(rows, copy_of)
        if undeclared:
            listed = ", ".join(f"{a}/{b}: {n}" for (a, b), n in undeclared.items())
            raise SystemExit(
                f"user ids shared between databases with no --copy-of: {listed}. "
                "Declare which one was seeded from the other."
            )
        played = await load_team_owners(client, list(copy_of))
        without_membership = copies_without_activity(rows, copy_of, played)

        components, junk = build_components(rows)

        tournament_ids = {
            t["slug"]: t["_id"] async for t in dest["tournaments"].find({}, {"slug": 1})
        }
        missing = set(slug_by_db.values()) - set(tournament_ids)
        if missing:
            raise SystemExit(
                f"no registry row for {sorted(missing)} -- create the tournaments "
                "first, including the retired ones, or memberships will point at "
                "ids with no name"
            )

        planned = [
            (group_id(c), plan_accounts(c, group_id(c), admin_keys, junk))
            for c in components
        ]
        report = await apply_accounts(
            dest, planned, slug_by_db, tournament_ids, without_membership, args.apply
        )
    finally:
        client.close()

    summary = {
        "mode": "apply" if args.apply else "dry-run",
        "legacy_rows": len(rows),
        "components": len(components),
        "accounts_created": report.accounts_created,
        "accounts_updated": report.accounts_updated,
        "memberships": report.memberships,
        "copied_rows_without_membership": len(without_membership),
        "review_groups": report.review_groups,
        "junk_keys_withheld": len(junk),
        "platform_admins_configured": len(admin_keys),
        "conflicts": report.conflicts,
    }
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "apply_summary.json").write_text(
        json.dumps(summary, indent=2, default=str)
    )
    print(json.dumps(summary, indent=2, default=str))
    if report.conflicts:
        print(
            f"\n{len(report.conflicts)} accounts were left as an earlier run wrote "
            "them: their rows now group differently. Resolve them before cutover."
        )
    if not args.apply:
        print("\nDry run -- nothing was written. Re-run with --apply.")
    if report.conflicts:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
