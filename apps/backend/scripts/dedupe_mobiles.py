"""Clear duplicate mobile numbers so the uniq_mobile index can build.

Two accounts holding byte-identical mobile values block the unique index added
in app/models/user.py, and Beanie builds indexes at startup, so deploying
against such a database fails the API on boot. This script keeps the number on
one account per group and clears it (sets mobile to None) on the rest.

Nothing is deleted. Losing accounts keep every other field and can still sign
in by username; they simply no longer hold the number. That number was already
unusable for them: login by mobile takes the first digit match it finds, so
only one account in each group could ever have used it.

Which account keeps it, in order:

  1. Active beats soft-deleted.
  2. More contest enrollments, then more teams -- the account with real play
     history is the one the person actually uses.
  3. More recent last_login, treating "never" as oldest.
  4. Older created_at, as the original registration.

Dry run by default; --apply performs the writes and first dumps every value it
is about to clear to a timestamped JSON file so the change can be reversed.

  python scripts/dedupe_mobiles.py                      # report every database
  python scripts/dedupe_mobiles.py --database Dcpl      # report one
  python scripts/dedupe_mobiles.py --apply              # write, with backup
"""

import argparse
import asyncio
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Ensure the backend package root is importable when running this script directly.
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

ROOT_ENV_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
)
load_dotenv(dotenv_path=ROOT_ENV_PATH)

SYSTEM_DATABASES = {"admin", "local", "config"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clear duplicate mobile numbers that block the uniq_mobile index."
    )
    parser.add_argument(
        "--database",
        help="Only process this database. Default: every non-system database.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Perform the writes. Without it the script only reports.",
    )
    parser.add_argument(
        "--backup-dir",
        default=".",
        help="Where to write the pre-change backup JSON (default: cwd).",
    )
    return parser.parse_args()


async def rank_key(db, doc):
    """Sort key; the account sorting first keeps the number."""
    uid = doc["_id"]
    enrollments = await db["team_contest_enrollments"].count_documents({"user_id": uid})
    teams = await db["teams"].count_documents({"user_id": uid})
    last_login = doc.get("last_login") or datetime.min
    if last_login.tzinfo is not None:
        last_login = last_login.replace(tzinfo=None)
    created = doc.get("created_at") or datetime.max
    if created.tzinfo is not None:
        created = created.replace(tzinfo=None)
    # Seconds since year 1, not the Unix epoch: datetime.min.timestamp()
    # raises on the sentinel used for accounts that never logged in.
    origin = datetime(1, 1, 1)
    return (
        0 if doc.get("is_active", True) else 1,  # active first
        -enrollments,
        -teams,
        -(last_login - origin).total_seconds(),
        (created - origin).total_seconds(),
    )


def describe(doc, enrollments=None, teams=None) -> str:
    state = "active" if doc.get("is_active", True) else "DELETED"
    login = doc.get("last_login")
    extra = ""
    if enrollments is not None:
        extra = f" enrolled={enrollments} teams={teams}"
    return (
        f"{str(doc.get('username'))[:24]:<26} {state:<8}"
        f" created={str(doc.get('created_at'))[:10]}"
        f" last_login={str(login)[:10] if login else 'never':<10}{extra}"
    )


async def process_database(db, name, apply_changes, backup):
    docs = await db["users"].find({"mobile": {"$type": "string"}}).to_list(length=None)
    by_raw = defaultdict(list)
    for doc in docs:
        by_raw[doc["mobile"]].append(doc)
    groups = {raw: g for raw, g in by_raw.items() if len(g) > 1}
    if not groups:
        return 0, 0

    print(f"\n=== {name} ===")
    cleared = 0
    for raw, group in sorted(groups.items()):
        keyed = []
        for doc in group:
            uid = doc["_id"]
            enrollments = await db["team_contest_enrollments"].count_documents(
                {"user_id": uid}
            )
            teams = await db["teams"].count_documents({"user_id": uid})
            keyed.append((await rank_key(db, doc), doc, enrollments, teams))
        keyed.sort(key=lambda item: item[0])

        print(f"  {raw}")
        for idx, (_, doc, enrollments, teams) in enumerate(keyed):
            verb = "KEEP " if idx == 0 else "clear"
            print(f"    {verb} {describe(doc, enrollments, teams)}")

        for _, doc, _, _ in keyed[1:]:
            backup.append(
                {
                    "database": name,
                    "user_id": str(doc["_id"]),
                    "username": doc.get("username"),
                    "mobile": doc["mobile"],
                }
            )
            cleared += 1
            if apply_changes:
                await db["users"].update_one(
                    {"_id": doc["_id"]},
                    {
                        "$set": {
                            "mobile": None,
                            "updated_at": datetime.now(timezone.utc),
                        }
                    },
                )
    return len(groups), cleared


async def main() -> None:
    args = parse_args()
    mongo_uri = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    safe_uri = re.sub(r"://[^@/]*@", "://<redacted>@", mongo_uri)
    print(f"Connecting to MongoDB at: {safe_uri}")
    print("Mode: APPLY (writes)" if args.apply else "Mode: dry run (no writes)")

    client = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=20000)

    if args.database:
        names = [args.database]
    else:
        names = sorted(
            n for n in await client.list_database_names() if n not in SYSTEM_DATABASES
        )

    backup: list = []
    total_groups = total_cleared = 0
    for name in names:
        groups, cleared = await process_database(client[name], name, args.apply, backup)
        total_groups += groups
        total_cleared += cleared

    print(
        f"\n{total_groups} duplicate group(s); "
        f"{total_cleared} account(s) {'cleared' if args.apply else 'would be cleared'}."
    )

    if backup and args.apply:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = os.path.join(args.backup_dir, f"mobile_dedupe_backup_{stamp}.json")
        with open(path, "w") as fh:
            json.dump(backup, fh, indent=2)
        print(f"Backup of cleared values written to {path}")
    elif not args.apply:
        print("Dry run only. Re-run with --apply to write.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
