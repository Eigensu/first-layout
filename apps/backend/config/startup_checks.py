"""Checks run at boot, before the service takes a request.

A misconfiguration found here stops the service starting. Found on the first
request instead, it reads as an empty site or an app bug.
"""

from app.utils.tenant import TENANT_MODELS
from config.settings import settings


async def assert_tenancy_matches_data() -> None:
    """Refuse to serve when TENANCY disagrees with the database.

    Both mistakes fail closed -- neither can show one tournament another's
    data (app/utils/tenant.py) -- but both look like data loss:

      * ``single`` against the unified database filters on a null
        ``tournament_id`` that no document there has, so every page is empty.
      * ``shared`` against a legacy database, or one the backfill has not
        finished, leaves every untagged document visible to no tournament.

    One indexed ``find_one`` per collection.
    """
    seen = set()
    for model in TENANT_MODELS:
        collection = model.get_motor_collection()
        # AdminPlayer and PublicPlayer are two views of one collection.
        if collection.name in seen:
            continue
        seen.add(collection.name)

        if settings.shared_tenancy:
            if await collection.find_one({"tournament_id": None}, {"_id": 1}):
                raise RuntimeError(
                    f"TENANCY=shared, but {collection.name} holds documents with "
                    f"no tournament_id, which no tournament can see. Finish the "
                    f"backfill (docs/UNIFIED_AUTH_SPEC.md §7, Phase 3) first, or "
                    f"set TENANCY=single on a legacy tournament's service."
                )
        elif await collection.find_one({"tournament_id": {"$ne": None}}, {"_id": 1}):
            raise RuntimeError(
                f"TENANCY=single, but {collection.name} holds documents tagged "
                f"with a tournament_id: this is the unified database. Set "
                f"TENANCY=shared."
            )
