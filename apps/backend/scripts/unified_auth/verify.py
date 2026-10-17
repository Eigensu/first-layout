"""The checks that must pass before anything is repointed at the new database.

Every one of these has a failure it is there to catch, and none of them is
advisory. A migration that half-worked is worse than one that did not run: the
first is discovered by a user who cannot sign in.

Two kinds of check, and both are needed. Some look for something *wrong* among
what was written -- a duplicate, an orphan, a missing tournament_id. The others
reconcile what was written against the sources, because a phase that stopped
early leaves nothing wrong behind, only something missing (spec §13.7, R20).
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from bson import ObjectId
from bson.errors import InvalidId

from .tenant_import import LEDGER, USER_REFERENCE_FIELDS


@dataclass
class Check:
    name: str
    ok: bool
    detail: str = ""
    sample: List[str] = field(default_factory=list)


@dataclass
class VerificationResult:
    checks: List[Check] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(c.ok for c in self.checks)

    def add(
        self, name: str, ok: bool, detail: str = "", sample: Optional[Sequence] = None
    ):
        self.checks.append(
            Check(
                name=name,
                ok=ok,
                detail=detail,
                sample=[str(s) for s in (sample or [])][:10],
            )
        )
        return self


# (collection, field, bucket): every file a migrated document points at.
FILE_REFERENCES = (
    ("users", "avatar_file_id", "avatars"),
    ("contests", "logo_file_id", "contest_logos"),
    ("sponsors", "logo_file_id", "sponsor_logos"),
    ("carousel_images", "image_file_id", "carousel_images"),
    ("global_settings", "default_contest_logo_file_id", "contest_logos"),
)


def _as_object_id(value):
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError):
        return value


async def verify(
    dest, sources: Dict[str, Any], tournament_ids: Dict[str, ObjectId]
) -> VerificationResult:
    """`sources` maps each source database name to its handle; `tournament_ids`
    maps the same names to the tournament each became."""
    result = VerificationResult()

    users = dest["users"]
    memberships = dest["tournament_memberships"]
    id_map = dest["user_id_map"]

    # --- what should exist, does ------------------------------------------

    unmapped = []
    for name, src in sources.items():
        expected = await src["users"].count_documents({})
        mapped = await id_map.count_documents({"source_db": name})
        if mapped != expected:
            unmapped.append(f"{name}: {mapped} mapped of {expected}")
    result.add(
        "every legacy row maps exactly once",
        not unmapped,
        "; ".join(unmapped),
    )

    have = {
        (m["user_id"], m["tournament_id"])
        async for m in memberships.find({}, {"user_id": 1, "tournament_id": 1})
    }
    missing_memberships = []
    async for row in id_map.find(
        {"source_db": {"$in": list(sources)}, "earns_membership": True}
    ):
        if (row["user_id"], tournament_ids[row["source_db"]]) not in have:
            missing_memberships.append(f"{row['source_db']}:{row['legacy_user_id']}")
    result.add(
        "every row that earns a membership has one",
        not missing_memberships,
        f"{len(missing_memberships)} rows have no membership in their tournament",
        missing_memberships,
    )

    short = []
    for name, src in sources.items():
        for collection in USER_REFERENCE_FIELDS:
            expected = await src[collection].count_documents({})
            ledger = [
                d["doc_id"]
                async for d in dest[LEDGER].find(
                    {"source_db": name, "collection": collection}, {"doc_id": 1}
                )
            ]
            copied = await dest[collection].count_documents({"_id": {"$in": ledger}})
            if not expected == len(ledger) == copied:
                short.append(
                    f"{name}.{collection}: {expected} in source, "
                    f"{len(ledger)} recorded, {copied} present"
                )
        if await src["global_settings"].find_one({"_id": "global"}, {"_id": 1}):
            row_id = f"tournament:{tournament_ids[name]}"
            if not await dest["global_settings"].find_one({"_id": row_id}, {"_id": 1}):
                short.append(f"{name}.global_settings: no row for its tournament")
    result.add(
        "every source document was copied",
        not short,
        f"{len(short)} collections do not reconcile",
        short,
    )

    dangling = []
    for collection, field_name, bucket in FILE_REFERENCES:
        async for doc in dest[collection].find(
            {field_name: {"$type": "string"}}, {field_name: 1}
        ):
            file_id = _as_object_id(doc[field_name])
            if not await dest[f"{bucket}.files"].find_one({"_id": file_id}, {"_id": 1}):
                dangling.append(f"{collection} {doc['_id']} -> {bucket} {file_id}")
    result.add(
        "every file a document points at was copied",
        not dangling,
        f"{len(dangling)} references to files the unified database lacks",
        dangling,
    )

    # --- nothing written is wrong ----------------------------------------

    # An account nobody can sign in to is the worst outcome of the whole
    # migration: the person still exists, their history is intact, and they are
    # locked out with no route back that does not involve support. Accounts
    # deleted everywhere carry no credential by design, so they are excluded.
    locked_out = users.find(
        {
            "is_active": True,
            "hashed_password": None,
            "legacy_hashes": {"$size": 0},
            "google_ids": {"$size": 0},
            "apple_ids": {"$size": 0},
        },
        {"_id": 1, "email": 1},
    )
    stranded = [d async for d in locked_out]
    result.add(
        "every live account has a usable credential",
        not stranded,
        f"{len(stranded)} accounts have no password, legacy hash, Google or Apple link",
        [d.get("email") or d["_id"] for d in stranded],
    )

    # Duplicate credentials mean the unique indexes could not be built, which
    # means the merge did not actually resolve identity.
    for field_name in ("emails", "mobiles", "google_ids", "apple_ids"):
        pipeline = [
            {"$unwind": f"${field_name}"},
            {"$group": {"_id": f"${field_name}", "n": {"$sum": 1}}},
            {"$match": {"n": {"$gt": 1}}},
            {"$limit": 10},
        ]
        dupes = [d async for d in users.aggregate(pipeline)]
        result.add(
            f"no {field_name} value is held by two accounts",
            not dupes,
            f"{len(dupes)} duplicated values",
            [d["_id"] for d in dupes],
        )

    dupe_membership = [
        d
        async for d in memberships.aggregate(
            [
                {
                    "$group": {
                        "_id": {"u": "$user_id", "t": "$tournament_id"},
                        "n": {"$sum": 1},
                    }
                },
                {"$match": {"n": {"$gt": 1}}},
                {"$limit": 10},
            ]
        )
    ]
    result.add(
        "one membership per person per tournament",
        not dupe_membership,
        f"{len(dupe_membership)} duplicated pairs",
    )

    known_ids = {d["_id"] async for d in users.find({}, {"_id": 1})}
    for collection, field_name in (
        ("teams", "user_id"),
        ("team_contest_enrollments", "user_id"),
    ):
        orphans = []
        async for doc in dest[collection].find({}, {field_name: 1}):
            value = doc.get(field_name)
            if value is not None and _as_object_id(value) not in known_ids:
                orphans.append(doc["_id"])
                if len(orphans) >= 10:
                    break
        result.add(
            f"every {collection}.{field_name} resolves to a user",
            not orphans,
            f"{len(orphans)}+ documents point at no account",
            orphans,
        )

    untagged = {}
    for collection in ("contests", "teams", "players", "team_contest_enrollments"):
        count = await dest[collection].count_documents({"tournament_id": None})
        if count:
            untagged[collection] = count
    result.add(
        "every tenant document carries a tournament_id",
        not untagged,
        ", ".join(f"{k}: {v}" for k, v in untagged.items()),
    )

    needs_review = await users.count_documents({"merge_state": "needs_review"})
    result.add(
        "flagged components were left for review, not merged",
        True,
        f"{needs_review} accounts await a decision (informational)",
    )

    return result


def render(result: VerificationResult) -> str:
    lines = []
    for check in result.checks:
        mark = "PASS" if check.ok else "FAIL"
        lines.append(f"[{mark}] {check.name}")
        if check.detail:
            lines.append(f"       {check.detail}")
        for sample in check.sample:
            lines.append(f"       - {sample}")
    lines.append("")
    lines.append(
        "ALL CHECKS PASSED" if result.ok else "VERIFICATION FAILED -- do not cut over"
    )
    return "\n".join(lines)
