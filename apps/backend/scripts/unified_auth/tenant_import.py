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
    rewritten_user_refs: Dict[str, int] = field(default_factory=dict)
    unmapped_user_refs: Dict[str, int] = field(default_factory=dict)
    enrollment_collisions: List[EnrollmentCollision] = field(default_factory=list)


async def find_id_collisions(
    client, db_names: Sequence[str], collections: Sequence[str]
) -> Dict[str, List[str]]:
    """`_id` values claimed by more than one source database.

    ObjectIds are practically unique, so this should always come back empty --
    but "practically" across five databases and hundreds of thousands of
    documents is worth one cheap check rather than optimism. A missed collision
    would be caught by the unique `_id` index on insert, so the failure mode is
    safe either way; this only means finding out before a long run rather than
    during one.
    """
    collisions: Dict[str, List[str]] = {}
    for collection in collections:
        seen: Dict[str, str] = {}
        clashing: List[str] = []
        for db_name in db_names:
            cursor = client[db_name][collection].find({}, {"_id": 1})
            async for doc in cursor:
                key = str(doc["_id"])
                if key in seen and seen[key] != db_name:
                    clashing.append(key)
                else:
                    seen[key] = db_name
        if clashing:
            collisions[collection] = clashing
    return collisions


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
