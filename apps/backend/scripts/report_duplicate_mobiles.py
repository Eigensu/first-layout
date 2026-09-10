"""Report mobile numbers held by more than one account.

Run this against a database BEFORE deploying the uniq_mobile index added to
app/models/user.py. Beanie builds indexes on startup, and a unique index build
fails if the collection already violates it -- which would take the API down on
boot rather than failing quietly.

Two different problems are reported, and only the first one blocks the index:

  EXACT duplicates      Two accounts store byte-identical mobile values. The
                        uniq_mobile index cannot build while these exist.
                        Resolve them before deploying.

  NORMALIZED collisions Two accounts store the same number in different forms,
                        e.g. "+91 98765 43210" and "919876543210". These do NOT
                        block the index, because the index is on the raw value.
                        They are still a real problem: login accepts a mobile as
                        the identifier and takes the first digit match it finds,
                        so which account you reach is arbitrary.

Read-only; it never writes.
"""

import asyncio
import os
import sys
from collections import defaultdict

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Ensure the backend package root is importable when running this script directly.
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

ROOT_ENV_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
)
load_dotenv(dotenv_path=ROOT_ENV_PATH)


def label(doc) -> str:
    return (
        doc.get("username")
        or doc.get("full_name")
        or doc.get("email")
        or str(doc.get("_id"))
    )


def describe(doc) -> str:
    state = "active" if doc.get("is_active", True) else "DELETED"
    return f"{label(doc)} ({doc.get('_id')}, {doc.get('auth_provider', 'password')}, {state})"


async def main() -> None:
    mongo_uri = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("MONGODB_DB_NAME", "walle_arena")

    print(f"Connecting to MongoDB at: {mongo_uri}")
    client = AsyncIOMotorClient(mongo_uri)
    users = client.get_database(db_name)["users"]

    docs = await users.find({"mobile": {"$type": "string"}}).to_list(length=None)
    print(f"Accounts with a mobile set: {len(docs)}")

    by_raw = defaultdict(list)
    by_digits = defaultdict(list)
    for doc in docs:
        raw = doc["mobile"]
        by_raw[raw].append(doc)
        digits = "".join(ch for ch in raw if ch.isdigit())
        if digits:
            by_digits[digits].append(doc)

    exact = {k: v for k, v in by_raw.items() if len(v) > 1}
    normalized = {
        k: v
        for k, v in by_digits.items()
        if len(v) > 1 and len({d["mobile"] for d in v}) > 1
    }

    print("\n== EXACT duplicates (these block the uniq_mobile index) ==")
    if not exact:
        print("  None. The index can build.")
    for raw, group in sorted(exact.items()):
        print(f"  {raw!r} held by {len(group)} accounts:")
        for doc in group:
            print(f"    - {describe(doc)}")

    print("\n== NORMALIZED collisions (same number, different formatting) ==")
    if not normalized:
        print("  None.")
    for digits, group in sorted(normalized.items()):
        print(f"  {digits} held by {len(group)} accounts:")
        for doc in group:
            print(f"    - {doc['mobile']!r} {describe(doc)}")

    print(
        f"\nSummary: {len(exact)} exact duplicate value(s), "
        f"{len(normalized)} normalized collision(s)."
    )
    if exact:
        print(
            "Deploying uniq_mobile will FAIL until the exact duplicates are resolved."
        )

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
