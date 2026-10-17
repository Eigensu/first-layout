"""Moving one tournament's game data into the unified database.

Copy, tag, rewrite: each collection is copied across, stamped with its
`tournament_id`, and its user references remapped through `user_id_map`.

`_id` is preserved on every copy, and that is what keeps this tractable.
Documents reference each other by ObjectId -- `teams.contest_id`,
`enrollments.team_id`, `player_contest_points.player_id` -- so keeping the
original id means every one of those references stays valid with no remapping
at all. Regenerating ids would mean rewriting each reference by hand, and
missing one would leave a team pointing at nothing.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

from bson import ObjectId

# collection -> the field holding a user id, if any
USER_REFERENCE_FIELDS: Dict[str, Optional[str]] = {
    "contests": None,
    "teams": "user_id",
    "team_contest_enrollments": "user_id",
    "players": None,
    "slots": None,
    "player_contest_points": None,
    "sponsors": None,
    "carousel_images": None,
    "import_logs": "user_id",
    "admin_action_logs": "admin_id",
}

# import_logs.user_id and admin_action_logs.admin_id are strings, not
# ObjectIds. Rewriting them as ObjectIds would break every read of those
# collections, which is the sort of thing an audit trail fails silently at.
STRING_USER_REFERENCES = {"import_logs", "admin_action_logs"}

ACTIVE = "active"
REMOVED = "removed"


@dataclass
class EnrollmentCollision:
    """Two merged accounts that both had an active team in the same contest."""

    contest_id: str
    user_id: str
    kept_enrollment_id: str
    removed_enrollment_ids: List[str] = field(default_factory=list)


@dataclass
class ImportReport:
    source_db: str
    tournament_slug: str
    copied: Dict[str, int] = field(default_factory=dict)
    removed: Dict[str, int] = field(default_factory=dict)
    files: Dict[str, Dict[str, int]] = field(default_factory=dict)
    unmapped_user_refs: Dict[str, int] = field(default_factory=dict)
    enrollment_collisions: List[EnrollmentCollision] = field(default_factory=list)


# Which source put each copied document there. Phase 3 preserves `_id`, so
# after one run every copied document exists in both places; this is what
# tells "copied from here last time" apart from a real clash (spec §13.4, R10),
# and what finds the copies whose source document has since been deleted
# (R11). A ledger rather than a field on the document, because the app drops
# fields its models do not declare the first time it saves one.
LEDGER = "import_ledger"

# The settings fields a tournament's row carries (app/models/settings.py).
SETTINGS_FIELDS = (
    "default_contest_logo_file_id",
    "min_players_per_team",
    "max_players_per_team",
)

# GridFS buckets holding files that tenant documents point at by id: contest
# and sponsor logos, carousel images, and the settings' default contest logo
# (R13). Avatars belong to users and are copied by phase 4.
TENANT_BUCKETS = ("contest_logos", "sponsor_logos", "carousel_images")


def ledger_id(collection: str, doc_id) -> str:
    return f"{collection}:{doc_id}"


async def foreign_collisions(
    src, dest, source_db: str, collections: Sequence[str]
) -> Dict[str, List[str]]:
    """`_id`s this source would overwrite that it did not put there itself.

    A document this source copied on an earlier run is expected to be there --
    that is the re-run phase 6 makes. Anything else holding the same `_id`
    belongs to another source, and overwriting it would lose that data.
    """
    collisions: Dict[str, List[str]] = {}
    for collection in collections:
        ids = [d["_id"] async for d in src[collection].find({}, {"_id": 1})]
        if not ids:
            continue
        present = [
            d["_id"]
            async for d in dest[collection].find({"_id": {"$in": ids}}, {"_id": 1})
        ]
        if not present:
            continue
        ours = {
            d["doc_id"]
            async for d in dest[LEDGER].find(
                {
                    "_id": {"$in": [ledger_id(collection, i) for i in present]},
                    "source_db": source_db,
                },
                {"doc_id": 1},
            )
        }
        clashing = [str(i) for i in present if i not in ours]
        if clashing:
            collisions[collection] = clashing
    return collisions


async def import_collection(
    src,
    dest,
    source_db: str,
    collection: str,
    tournament_id,
    user_id_for: Dict[Tuple[str, str], str],
    demote: Dict[str, str],
    apply: bool,
) -> Tuple[int, int, int]:
    """Copy one collection; returns (copied, unmapped user refs, removed).

    Removed counts documents copied on an earlier run whose source has since
    been deleted -- a contest deleted before cutover must not survive it.
    """
    copied = unmapped = 0
    seen = []
    async for doc in src[collection].find({}):
        remapped, missed = remap_document(
            doc, collection, tournament_id, user_id_for, source_db
        )
        if missed:
            unmapped += 1
        if collection == "team_contest_enrollments" and str(doc["_id"]) in demote:
            remapped["status"] = REMOVED
            remapped["removed_at"] = remapped.get("removed_at")
            remapped["removal_reason"] = "superseded by merge (see migration report)"
        if apply:
            # The claim first, then the copy. Stopped in between, the next run
            # finds its own claim and writes the copy; the other way round it
            # would find a document nobody claimed and refuse to touch it.
            await dest[LEDGER].update_one(
                {"_id": ledger_id(collection, doc["_id"])},
                {
                    "$set": {
                        "collection": collection,
                        "doc_id": doc["_id"],
                        "source_db": source_db,
                    }
                },
                upsert=True,
            )
            await dest[collection].replace_one(
                {"_id": remapped["_id"]}, remapped, upsert=True
            )
        seen.append(doc["_id"])
        copied += 1

    removed = 0
    stale = dest[LEDGER].find(
        {"collection": collection, "source_db": source_db, "doc_id": {"$nin": seen}}
    )
    async for entry in stale:
        removed += 1
        if apply:
            await dest[collection].delete_one({"_id": entry["doc_id"]})
            await dest[LEDGER].delete_one({"_id": entry["_id"]})
    return copied, unmapped, removed


def tournament_settings(source_doc: dict, tournament_id) -> dict:
    """A source's one settings document, as its tournament's own row (R12).

    Every source called its document "global", so the `_id` cannot be kept;
    this one is derived from the tournament, which keeps re-runs to one row.
    """
    doc = {k: source_doc[k] for k in SETTINGS_FIELDS if k in source_doc}
    doc["_id"] = f"tournament:{tournament_id}"
    doc["tournament_id"] = tournament_id
    doc["updated_at"] = source_doc.get("updated_at")
    return doc


async def copy_gridfs_file(src, dest, bucket: str, file_id) -> str:
    """Copy one GridFS file under its own `_id`; "copied", "present" or "missing".

    Copied as the documents GridFS stores, not through upload: the file record
    keeps its metadata -- the real content type, which the serving routes
    trust (R15) -- and its `_id`, so nothing that refers to it needs rewriting
    and a re-run finds it already there (R16). Chunks go first and the file
    record last, so a crash in between leaves no record and the next run
    copies it again.
    """
    record = await src[f"{bucket}.files"].find_one({"_id": file_id})
    if record is None:
        return "missing"
    if await dest[f"{bucket}.files"].find_one({"_id": file_id}, {"_id": 1}):
        return "present"
    async for chunk in src[f"{bucket}.chunks"].find({"files_id": file_id}):
        await dest[f"{bucket}.chunks"].replace_one(
            {"_id": chunk["_id"]}, chunk, upsert=True
        )
    await dest[f"{bucket}.files"].replace_one({"_id": file_id}, record, upsert=True)
    return "copied"


def resolve_enrollment_collisions(
    enrollments: Sequence[dict], user_id_for: Dict[Tuple[str, str], str], source_db: str
) -> Tuple[List[EnrollmentCollision], Dict[str, str]]:
    """Decide which team stays enrolled when two merged accounts become one.

    `uniq_active_user_per_contest` guarantees one active team per user per
    contest. If two accounts that merge both had an active team in the *same*
    contest, rewriting both to one user id violates it -- and this is the one
    place in the whole migration where merging actually takes something away
    from a user.

    The most recently enrolled team stays active; the others are marked
    REMOVED rather than deleted, so the team and its history survive and the
    decision is visible. Every case goes in the migration report.
    """
    by_pair: Dict[Tuple[str, str], List[dict]] = {}
    for row in enrollments:
        if str(row.get("status", "")).lower() != ACTIVE:
            continue
        mapped = user_id_for.get((source_db, str(row["user_id"])))
        if not mapped:
            continue
        by_pair.setdefault((str(row["contest_id"]), mapped), []).append(row)

    collisions: List[EnrollmentCollision] = []
    demote: Dict[str, str] = {}

    for (contest_id, mapped_user), rows in by_pair.items():
        if len(rows) < 2:
            continue
        # Most recently enrolled wins: it is the squad that person last chose
        # to field, and the one they would expect to still be in.
        ranked = sorted(
            rows,
            key=lambda r: (
                r.get("enrolled_at") or r.get("_id").generation_time,
                str(r["_id"]),
            ),
            reverse=True,
        )
        keep, rest = ranked[0], ranked[1:]
        collisions.append(
            EnrollmentCollision(
                contest_id=contest_id,
                user_id=mapped_user,
                kept_enrollment_id=str(keep["_id"]),
                removed_enrollment_ids=[str(r["_id"]) for r in rest],
            )
        )
        for row in rest:
            demote[str(row["_id"])] = REMOVED

    return collisions, demote


def remap_document(
    doc: dict,
    collection: str,
    tournament_id,
    user_id_for: Dict[Tuple[str, str], str],
    source_db: str,
) -> Tuple[dict, bool]:
    """Tag a document with its tournament and repoint its user reference.

    Returns the document and whether a user reference was left unmapped -- which
    means the migration found a team belonging to nobody, and is a verification
    failure rather than something to paper over.
    """
    doc = dict(doc)
    doc["tournament_id"] = tournament_id

    field_name = USER_REFERENCE_FIELDS.get(collection)
    if not field_name or doc.get(field_name) is None:
        return doc, False

    legacy_value = str(doc[field_name])
    mapped = user_id_for.get((source_db, legacy_value))
    if mapped is None:
        return doc, True

    # Kept so phase 3 is reversible without consulting user_id_map.
    doc["legacy_user_id"] = doc[field_name]
    # import_logs.user_id and admin_action_logs.admin_id are declared as str on
    # their models; writing an ObjectId there would typecheck at insert and
    # then fail every read of the audit trail.
    doc[field_name] = (
        mapped if collection in STRING_USER_REFERENCES else ObjectId(mapped)
    )
    return doc, False
