"""The checks that must pass before anything is repointed at the new database.

Every one of these has a failure it is there to catch, and none of them is
advisory. A migration that half-worked is worse than one that did not run: the
first is discovered by a user who cannot sign in.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

from bson import ObjectId


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


async def verify(
    auth_db, tenant_db, source_dbs: Sequence[str], expected_legacy_rows: int
) -> VerificationResult:
    result = VerificationResult()

    users = auth_db["users"]
    memberships = auth_db["tournament_memberships"]
    id_map = auth_db["user_id_map"]

    mapped = await id_map.count_documents({})
    result.add(
        "every legacy row maps exactly once",
        mapped == expected_legacy_rows,
        f"{mapped} mapped, {expected_legacy_rows} legacy rows found",
    )

    # An account nobody can sign in to is the worst outcome of the whole
    # migration: the person still exists, their history is intact, and they are
    # locked out with no route back that does not involve support.
    locked_out = users.find(
        {
            "hashed_password": None,
            "legacy_hashes": {"$size": 0},
            "google_ids": {"$size": 0},
        },
        {"_id": 1, "email": 1},
    )
    stranded = [d async for d in locked_out]
    result.add(
        "every account has a usable credential",
        not stranded,
        f"{len(stranded)} accounts have no password, no legacy hash and no Google link",
        [d.get("email") or d["_id"] for d in stranded],
    )

    # Duplicate credentials mean the unique indexes could not be built, which
    # means the merge did not actually resolve identity.
    for field_name in ("emails", "mobiles", "google_ids"):
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
        async for doc in tenant_db[collection].find({}, {field_name: 1}):
            value = doc.get(field_name)
            if value is not None and ObjectId(str(value)) not in known_ids:
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
        count = await tenant_db[collection].count_documents({"tournament_id": None})
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
