"""Writing phase 2's plan: accounts, the id map, memberships and avatar plans.

Re-runnable by construction, because phase 6 re-runs it in the read-only window
and a crash halfway through has to be finished, not cleaned up:

- every account resolves to the user id any of its rows was already mapped to,
  so a row that joins an imported person is attached to them rather than made
  into a second account (spec §13.3, R5);
- every write is an upsert keyed on what it describes, and the account is
  rewritten each run, so a password reset or a deletion in a source reaches the
  unified account on the next run (R6);
- the id map is written first, so an interrupted account resumes under the
  same user id instead of being inserted twice (R7).

What it will not do is merge or split accounts that a previous run already
wrote. Those cases are reported as conflicts for a person to resolve, and every
account involved is left exactly as it was.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Sequence, Set, Tuple

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from .merge_apply import AccountPlan, UnifiedAccount, plan_memberships

# Fields a planned account carries for the planner's benefit, not the user's.
_PLANNING_ONLY = {"source_rows", "avatar_source_db"}


@dataclass
class ApplyReport:
    accounts_created: int = 0
    accounts_updated: int = 0
    memberships: int = 0
    review_groups: int = 0
    reviewed_groups: int = 0
    conflicts: List[dict] = field(default_factory=list)


async def ensure_indexes(dest) -> None:
    await dest["user_id_map"].create_index(
        [("source_db", 1), ("legacy_user_id", 1)],
        unique=True,
        name="uniq_source_row",
    )
    await dest["avatar_migration"].create_index(
        "user_id", unique=True, name="uniq_avatar_plan"
    )


def account_document(account: UnifiedAccount, user_id: ObjectId) -> dict:
    doc = {k: v for k, v in vars(account).items() if k not in _PLANNING_ONLY}
    doc["avatar_url"] = (
        f"/api/users/{user_id}/avatar" if account.avatar_file_id else None
    )
    return doc


async def _resolve_user_id(dest, account: UnifiedAccount) -> Tuple[set, bool]:
    keys = [r.key for r in account.source_rows]
    mapped = dest["user_id_map"].find(
        {"$or": [{"source_db": db, "legacy_user_id": uid} for db, uid in keys]}
    )
    ids = {m["user_id"] async for m in mapped}
    return ids, bool(ids)


async def _write_account(
    dest,
    account: UnifiedAccount,
    user_id: ObjectId,
    slug_by_db: Dict[str, str],
    tournament_ids: Dict[str, ObjectId],
    without_membership: Set[Tuple[str, str]],
) -> int:
    # The map first: once it exists, a re-run resolves this account to the
    # same user id, whatever was or was not written after it.
    for row in account.source_rows:
        await dest["user_id_map"].update_one(
            {"source_db": row.source_db, "legacy_user_id": row.legacy_user_id},
            {
                "$setOnInsert": {"user_id": user_id},
                "$set": {
                    # Read by phase 5: a mapped row that earns a membership
                    # must have one.
                    "earns_membership": row.source_db in slug_by_db
                    and row.key not in without_membership,
                },
            },
            upsert=True,
        )

    await dest["users"].update_one(
        {"_id": user_id}, {"$set": account_document(account, user_id)}, upsert=True
    )

    if account.avatar_file_id:
        await dest["avatar_migration"].update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "source_db": account.avatar_source_db,
                    "file_id": account.avatar_file_id,
                }
            },
            upsert=True,
        )
    else:
        await dest["avatar_migration"].delete_many({"user_id": user_id})

    plans = plan_memberships(account, slug_by_db, without_membership)
    kept = []
    for plan in plans:
        tournament_id = tournament_ids[plan.tournament_slug]
        kept.append(tournament_id)
        await dest["tournament_memberships"].update_one(
            {"user_id": user_id, "tournament_id": tournament_id},
            {
                "$set": {
                    "tournament_slug": plan.tournament_slug,
                    "source_db": plan.source_db,
                    "legacy_user_id": ObjectId(plan.legacy_user_id),
                    "display_name": plan.display_name,
                    "role": plan.role,
                    "joined_at": plan.joined_at,
                    "last_login_at": plan.last_login_at,
                },
                "$setOnInsert": {
                    "status": "registered",
                    "stats": {
                        "teams_count": 0,
                        "contests_count": 0,
                        "best_rank": None,
                        "total_points": 0.0,
                        "refreshed_at": None,
                    },
                },
            },
            upsert=True,
        )
    # A membership an earlier run wrote that this one no longer plans -- a row
    # that moved to another account, say -- would otherwise outlive its reason.
    # Only migration-written ones: the app's own carry no source_db.
    await dest["tournament_memberships"].delete_many(
        {
            "user_id": user_id,
            "source_db": {"$type": "string"},
            "tournament_id": {"$nin": kept},
        }
    )
    return len(plans)


async def apply_accounts(
    dest,
    planned: Sequence[Tuple[str, AccountPlan]],
    slug_by_db: Dict[str, str],
    tournament_ids: Dict[str, ObjectId],
    without_membership: Set[Tuple[str, str]],
    apply: bool,
) -> ApplyReport:
    """Write every planned account; with `apply` False, only count what would be.

    Three passes, so that nothing is written on a guess:

    1. Resolve every account's user id, and find the conflicts, before writing
       anything. An earlier run's account that would now be split is claimed
       by several planned accounts, and *all* of them are left out -- writing
       the first would rewrite the saved account with half its rows before the
       second revealed the split.
    2. Release every key an existing account is about to give up. A key can
       move between accounts from one run to the next -- in a split group the
       most recently active row keeps a shared phone, and that can change --
       and the unique indexes would refuse the new holder while the old one
       still had it.
    3. Write.
    """
    report = ApplyReport()
    if apply:
        await ensure_indexes(dest)

    resolved = []
    claims: Dict[ObjectId, List[str]] = defaultdict(list)
    for group_id, plan in planned:
        for account in plan.accounts:
            ids, seen_before = await _resolve_user_id(dest, account)
            if len(ids) > 1:
                report.conflicts.append(
                    _conflict(
                        group_id,
                        account,
                        "rows written as separate accounts now form one",
                        ids,
                    )
                )
                continue
            user_id = ids.pop() if ids else ObjectId()
            claims[user_id].append(group_id)
            resolved.append((group_id, account, user_id, seen_before))

    writable = []
    for group_id, account, user_id, seen_before in resolved:
        if len(claims[user_id]) > 1:
            report.conflicts.append(
                _conflict(
                    group_id,
                    account,
                    "rows written as one account now form several",
                    {user_id},
                )
            )
            continue
        writable.append((group_id, account, user_id, seen_before))

    if apply:
        for _, account, user_id, seen_before in writable:
            if seen_before:
                await _release(
                    dest,
                    account,
                    user_id,
                    slug_by_db,
                    tournament_ids,
                    without_membership,
                )

    for group_id, account, user_id, seen_before in writable:
        if not apply:
            report.memberships += len(
                plan_memberships(account, slug_by_db, without_membership)
            )
        else:
            try:
                report.memberships += await _write_account(
                    dest,
                    account,
                    user_id,
                    slug_by_db,
                    tournament_ids,
                    without_membership,
                )
            except DuplicateKeyError as exc:
                # Only possible when an account left alone by a conflict still
                # holds a key this one is now planned to have.
                report.conflicts.append(
                    _conflict(
                        group_id,
                        account,
                        f"a key it needs is held by an account left unchanged: {exc}",
                        {user_id},
                    )
                )
                continue
        if seen_before:
            report.accounts_updated += 1
        else:
            report.accounts_created += 1

    for group_id, plan in planned:
        if plan.flags:
            report.review_groups += 1
            report.reviewed_groups += plan.reviewed
            if apply:
                await _write_review_item(dest, group_id, plan)

    return report


def _conflict(group_id: str, account: UnifiedAccount, problem: str, ids) -> dict:
    return {
        "group": group_id,
        "problem": problem,
        "rows": [list(r.key) for r in account.source_rows],
        "user_ids": sorted(str(i) for i in ids),
    }


async def _release(
    dest,
    account: UnifiedAccount,
    user_id: ObjectId,
    slug_by_db: Dict[str, str],
    tournament_ids: Dict[str, ObjectId],
    without_membership: Set[Tuple[str, str]],
) -> None:
    """Drop the keys and memberships this saved account is about to give up."""
    current = await dest["users"].find_one(
        {"_id": user_id},
        {"emails": 1, "mobiles": 1, "google_ids": 1, "apple_ids": 1, "mobile": 1},
    )
    if current:
        changes = {}
        for field_name in ("emails", "mobiles", "google_ids", "apple_ids"):
            held = current.get(field_name) or []
            kept = [v for v in held if v in getattr(account, field_name)]
            if kept != held:
                changes[field_name] = kept
        if current.get("mobile") and current["mobile"] not in account.mobiles:
            changes["mobile"] = None  # uniq_mobile covers the scalar too
        if changes:
            await dest["users"].update_one({"_id": user_id}, {"$set": changes})

    # uniq_legacy_row is unique on the legacy row, which can move to another
    # account between runs; its old membership has to go first.
    planned = {
        (tournament_ids[p.tournament_slug], ObjectId(p.legacy_user_id))
        for p in plan_memberships(account, slug_by_db, without_membership)
    }
    async for membership in dest["tournament_memberships"].find(
        {"user_id": user_id, "source_db": {"$type": "string"}}
    ):
        if (
            membership["tournament_id"],
            membership.get("legacy_user_id"),
        ) not in planned:
            await dest["tournament_memberships"].delete_one({"_id": membership["_id"]})


async def _write_review_item(dest, group_id: str, plan: AccountPlan) -> None:
    """One document per flagged group: who is in it, how it was resolved, and
    who lost which key."""
    rows = [r for a in plan.accounts for r in a.source_rows]
    update = {
        "$set": {
            "flags": plan.flags,
            # Which rows became which account: one row each until reviewed.
            "accounts": [[list(r.key) for r in a.source_rows] for a in plan.accounts],
            "rows": [
                {
                    "source_db": r.source_db,
                    "legacy_user_id": r.legacy_user_id,
                    "username": r.username,
                    "email": r.email,
                    "mobile": r.mobile,
                    "full_name": r.full_name,
                    "is_active": r.is_active,
                }
                for r in rows
            ],
            "withheld": [
                {
                    "kind": w.kind,
                    "value": w.value,
                    "kept_by": list(w.kept_by) if w.kept_by else None,
                    "held_by": [list(k) for k in w.held_by],
                }
                for w in plan.withheld
            ],
            "updated_at": datetime.utcnow(),
        },
    }
    # One or the other: Mongo refuses a field in both $set and $setOnInsert.
    if plan.reviewed:
        update["$set"]["status"] = "reviewed"
    else:
        update["$setOnInsert"] = {"status": "open"}
    await dest["merge_review"].update_one({"_id": group_id}, update, upsert=True)
