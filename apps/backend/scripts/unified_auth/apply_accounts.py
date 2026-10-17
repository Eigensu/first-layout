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
wrote. Those cases are reported as conflicts for a person to resolve.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Sequence, Set, Tuple

from bson import ObjectId

from .merge_apply import AccountPlan, UnifiedAccount, plan_memberships

# Fields a planned account carries for the planner's benefit, not the user's.
_PLANNING_ONLY = {"source_rows", "avatar_source_db"}


@dataclass
class ApplyReport:
    accounts_created: int = 0
    accounts_updated: int = 0
    memberships: int = 0
    review_groups: int = 0
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
    """Write every planned account; with `apply` False, only count what would be."""
    report = ApplyReport()
    if apply:
        await ensure_indexes(dest)

    claimed: Dict[ObjectId, str] = {}
    for group_id, plan in planned:
        for account in plan.accounts:
            ids, seen_before = await _resolve_user_id(dest, account)
            keys = [list(r.key) for r in account.source_rows]
            if len(ids) > 1:
                report.conflicts.append(
                    {
                        "group": group_id,
                        "problem": "rows written as separate accounts now form one",
                        "rows": keys,
                        "user_ids": sorted(str(i) for i in ids),
                    }
                )
                continue
            user_id = ids.pop() if ids else ObjectId()
            if user_id in claimed:
                report.conflicts.append(
                    {
                        "group": group_id,
                        "problem": "rows written as one account now form several",
                        "rows": keys,
                        "user_ids": [str(user_id)],
                        "also_claimed_by": claimed[user_id],
                    }
                )
                continue
            claimed[user_id] = group_id

            if seen_before:
                report.accounts_updated += 1
            else:
                report.accounts_created += 1

            if apply:
                report.memberships += await _write_account(
                    dest,
                    account,
                    user_id,
                    slug_by_db,
                    tournament_ids,
                    without_membership,
                )
            else:
                report.memberships += len(
                    plan_memberships(account, slug_by_db, without_membership)
                )

        if plan.flags:
            report.review_groups += 1
            if apply:
                await _write_review_item(dest, group_id, plan)

    return report


async def _write_review_item(dest, group_id: str, plan: AccountPlan) -> None:
    """One document per flagged group: who is in it, and who lost which key."""
    rows = [r for a in plan.accounts for r in a.source_rows]
    await dest["merge_review"].update_one(
        {"_id": group_id},
        {
            "$set": {
                "flags": plan.flags,
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
            "$setOnInsert": {"status": "open"},
        },
        upsert=True,
    )
