"""Reading legacy user rows out of the per-tournament databases."""

from typing import Dict, List, Optional, Sequence

from motor.motor_asyncio import AsyncIOMotorClient

from .identity_graph import LegacyRow


async def list_candidate_databases(client: AsyncIOMotorClient) -> List[str]:
    """Databases that look like a tournament's, rather than MongoDB's own."""
    names = await client.list_database_names()
    return [n for n in names if n not in {"admin", "local", "config"}]


async def load_rows(
    client: AsyncIOMotorClient, db_names: Sequence[str]
) -> List[LegacyRow]:
    """Every user document from every named database, as comparable rows.

    Reads only the fields identity resolution needs. Nothing here writes, and
    nothing here decides -- a source database is opened read-only in intent and
    is never modified by any phase before the cutover.
    """
    rows: List[LegacyRow] = []
    for db_name in db_names:
        collection = client[db_name]["users"]
        cursor = collection.find(
            {},
            {
                "username": 1,
                "email": 1,
                "mobile": 1,
                "google_id": 1,
                "full_name": 1,
                "is_admin": 1,
                "is_active": 1,
                "created_at": 1,
                "updated_at": 1,
                "last_login": 1,
            },
        )
        async for doc in cursor:
            rows.append(
                LegacyRow(
                    source_db=db_name,
                    legacy_user_id=str(doc["_id"]),
                    username=doc.get("username") or "",
                    email=doc.get("email"),
                    mobile=doc.get("mobile"),
                    google_id=doc.get("google_id"),
                    full_name=doc.get("full_name"),
                    is_admin=bool(doc.get("is_admin", False)),
                    is_active=bool(doc.get("is_active", True)),
                    created_at=doc.get("created_at"),
                    updated_at=doc.get("updated_at"),
                    last_login=doc.get("last_login"),
                )
            )
    return rows


async def inventory(
    client: AsyncIOMotorClient, db_names: Sequence[str]
) -> Dict[str, Dict[str, Optional[int]]]:
    """Per-database counts, so the scale of the migration is known up front.

    Also the only way to establish which database each service points at:
    Railway redacts MONGODB_DB_NAME values to a read-only integration, so the
    mapping has to be read off the data.
    """
    counted = ["users", "teams", "contests", "team_contest_enrollments", "players"]
    report: Dict[str, Dict[str, Optional[int]]] = {}

    for db_name in db_names:
        db = client[db_name]
        existing = set(await db.list_collection_names())
        stats: Dict[str, Optional[int]] = {
            name: (await db[name].count_documents({}) if name in existing else None)
            for name in counted
        }
        if "users" in existing:
            stats["users_with_mobile"] = await db["users"].count_documents(
                {"mobile": {"$type": "string", "$ne": ""}}
            )
            stats["users_with_google"] = await db["users"].count_documents(
                {"google_id": {"$type": "string"}}
            )
        stats["avatar_files"] = (
            await db["avatars.files"].count_documents({})
            if "avatars.files" in existing
            else None
        )
        report[db_name] = stats

    return report
