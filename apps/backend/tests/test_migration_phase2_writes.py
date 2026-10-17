"""Phase 2's writes, run twice -- because phase 6 runs it again.

The first run is the easy part. These are about the second: a signup made
during the backfill, a password reset in a source, a run that died halfway.
Each one used to leave the unified database wrong (spec §13.3, R5-R7).
"""

from datetime import datetime

import pytest
from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from scripts.unified_auth.apply_accounts import apply_accounts
from scripts.unified_auth.identity_graph import LegacyRow, build_components
from scripts.unified_auth.merge_apply import plan_accounts

OLD = datetime(2025, 2, 1)
RECENT = datetime(2026, 2, 1)
SLUGS = {"walle_lpcl": "lpcl", "walle_fifth": "fifth"}
TOURNAMENTS = {"lpcl": ObjectId(), "fifth": ObjectId()}


def row(db, uid, **kwargs) -> LegacyRow:
    defaults = dict(
        username=f"user{uid}",
        created_at=OLD,
        updated_at=OLD,
        last_login=OLD,
        full_name="Rahul Patel",
        hashed_password=f"hash-{db}-{uid}",
    )
    defaults.update(kwargs)
    return LegacyRow(source_db=db, legacy_user_id=str(uid), **defaults)


UID_A = str(ObjectId())
UID_B = str(ObjectId())
UID_C = str(ObjectId())


async def run(dest, rows, without_membership=frozenset()):
    components, junk = build_components(rows)
    planned = [
        (
            f"{c.rows[0].source_db}:{c.rows[0].legacy_user_id}",
            plan_accounts(
                c, f"{c.rows[0].source_db}:{c.rows[0].legacy_user_id}", None, junk
            ),
        )
        for c in components
    ]
    return await apply_accounts(
        dest, planned, SLUGS, TOURNAMENTS, set(without_membership), apply=True
    )


@pytest.fixture
def dest():
    return AsyncMongoMockClient()["walle_arena"]


@pytest.mark.asyncio
async def test_a_second_run_writes_nothing_new(dest):
    rows = [
        row("walle_lpcl", UID_A, mobile="9876543210"),
        row("walle_fifth", UID_B, mobile="9876543210", last_login=RECENT),
    ]

    first = await run(dest, rows)
    second = await run(dest, rows)

    assert (first.accounts_created, first.accounts_updated) == (1, 0)
    assert (second.accounts_created, second.accounts_updated) == (0, 1)
    assert await dest["users"].count_documents({}) == 1
    assert await dest["user_id_map"].count_documents({}) == 2
    assert await dest["tournament_memberships"].count_documents({}) == 2


@pytest.mark.asyncio
async def test_a_signup_during_the_backfill_joins_the_imported_person(dest):
    """It used to become a second account, or be skipped entirely (R5)."""
    imported = row("walle_lpcl", UID_A, mobile="9876543210")
    await run(dest, [imported])
    user_id = (await dest["user_id_map"].find_one({}))["user_id"]

    signup = row("walle_fifth", UID_B, mobile="9876543210", last_login=RECENT)
    report = await run(dest, [imported, signup])

    assert report.accounts_created == 0
    assert await dest["users"].count_documents({}) == 1
    mapped = await dest["user_id_map"].find_one({"legacy_user_id": UID_B})
    assert mapped["user_id"] == user_id
    assert (
        await dest["tournament_memberships"].count_documents({"user_id": user_id}) == 2
    )


@pytest.mark.asyncio
async def test_a_password_reset_in_a_source_reaches_the_account(dest):
    """Otherwise the new password is refused and the old one works (R6)."""
    await run(dest, [row("walle_lpcl", UID_A, hashed_password="old-hash")])
    await run(
        dest,
        [
            row(
                "walle_lpcl",
                UID_A,
                hashed_password="new-hash",
                updated_at=RECENT,
            )
        ],
    )

    user = await dest["users"].find_one({})
    assert user["hashed_password"] == "new-hash"


@pytest.mark.asyncio
async def test_a_deletion_in_a_source_reaches_the_account(dest):
    await run(dest, [row("walle_lpcl", UID_A)])
    await run(dest, [row("walle_lpcl", UID_A, is_active=False, updated_at=RECENT)])

    user = await dest["users"].find_one({})
    assert user["is_active"] is False
    assert user["hashed_password"] is None


@pytest.mark.asyncio
async def test_a_run_that_died_after_the_id_map_resumes_under_the_same_id(dest):
    """The map is written first; a re-run must reuse it, not insert again (R7)."""
    user_id = ObjectId()
    await dest["user_id_map"].insert_one(
        {"source_db": "walle_lpcl", "legacy_user_id": UID_A, "user_id": user_id}
    )

    report = await run(dest, [row("walle_lpcl", UID_A)])

    assert report.accounts_created == 0
    users = [u async for u in dest["users"].find({})]
    assert [u["_id"] for u in users] == [user_id]


@pytest.mark.asyncio
async def test_two_written_accounts_that_now_group_together_are_left_alone(dest):
    """Merging two existing accounts is a decision, not something a re-run does."""
    a = row("walle_lpcl", UID_A, mobile="9876543210")
    b = row("walle_fifth", UID_B, mobile="9123456789")
    await run(dest, [a, b])

    bridged = row("walle_fifth", UID_B, mobile="9876543210")
    report = await run(dest, [a, bridged])

    assert len(report.conflicts) == 1
    assert report.conflicts[0]["problem"].startswith("rows written as separate")
    assert await dest["users"].count_documents({}) == 2


@pytest.mark.asyncio
async def test_one_membership_per_tournament_however_many_rows(dest):
    rows = [
        row("walle_lpcl", UID_A, mobile="9876543210"),
        row("walle_lpcl", UID_B, mobile="919876543210", last_login=RECENT),
    ]

    await run(dest, rows)

    assert await dest["tournament_memberships"].count_documents({}) == 1


@pytest.mark.asyncio
async def test_an_idle_copy_is_mapped_but_earns_no_membership(dest):
    rows = [row("walle_lpcl", UID_A, mobile="9876543210")]

    await run(dest, rows, without_membership={("walle_lpcl", UID_A)})

    mapped = await dest["user_id_map"].find_one({})
    assert mapped["earns_membership"] is False
    assert await dest["tournament_memberships"].count_documents({}) == 0


@pytest.mark.asyncio
async def test_a_flagged_group_is_recorded_for_review_with_who_kept_what(dest):
    rows = [
        row("walle_lpcl", UID_A, mobile="9876543210", full_name="Rahul Patel"),
        row(
            "walle_fifth",
            UID_B,
            mobile="9876543210",
            full_name="Priya Sharma",
            last_login=RECENT,
        ),
    ]

    report = await run(dest, rows)

    assert report.review_groups == 1
    item = await dest["merge_review"].find_one({})
    assert item["flags"] == ["shared_mobile_diff_names"]
    assert item["withheld"] == [
        {
            "kind": "mobile",
            "value": "9876543210",
            "kept_by": ["walle_fifth", UID_B],
            "held_by": [["walle_fifth", UID_B], ["walle_lpcl", UID_A]],
        }
    ]
    assert await dest["users"].count_documents({"mobiles": "9876543210"}) == 1


@pytest.mark.asyncio
async def test_avatar_url_points_at_the_unified_account(dest):
    file_id = str(ObjectId())
    await run(dest, [row("walle_lpcl", UID_C, avatar_file_id=file_id)])

    user = await dest["users"].find_one({})
    assert user["avatar_file_id"] == file_id
    assert user["avatar_url"] == f"/api/users/{user['_id']}/avatar"
    plan = await dest["avatar_migration"].find_one({})
    assert (plan["source_db"], plan["file_id"]) == ("walle_lpcl", file_id)


@pytest.mark.asyncio
async def test_a_split_leaves_the_saved_account_exactly_as_it_was(dest):
    """Both halves claim the saved account, so neither may write it.

    Writing the first half and only then noticing the second would rewrite the
    saved account with half its rows and drop the other tournament.
    """
    a = row("walle_lpcl", UID_A, mobile="9876543210", full_name="Rahul Patel")
    b = row("walle_fifth", UID_B, mobile="9876543210", full_name="Rahul Patel")
    await run(dest, [a, b])
    before = await dest["users"].find_one({})

    renamed = row("walle_fifth", UID_B, mobile="9876543210", full_name="Priya Sharma")
    report = await run(dest, [a, renamed])

    assert len(report.conflicts) == 2
    assert await dest["users"].find_one({}) == before
    assert await dest["tournament_memberships"].count_documents({}) == 2


@pytest.mark.asyncio
async def test_a_shared_phone_can_change_hands_between_runs(dest):
    """In a split group the most recently active row keeps a shared phone, and
    which row that is can change. The old holder must give it up first, or
    the unique index refuses the new one and phase 6 stops."""
    await dest["users"].create_index(
        "mobiles",
        unique=True,
        partialFilterExpression={"mobiles.0": {"$exists": True}},
    )
    older = row("walle_lpcl", UID_A, mobile="9876543210", full_name="Rahul Patel")
    newer = row(
        "walle_fifth",
        UID_B,
        mobile="9876543210",
        full_name="Priya Sharma",
        last_login=RECENT,
    )
    await run(dest, [older, newer])

    returned = row(
        "walle_lpcl",
        UID_A,
        mobile="9876543210",
        full_name="Rahul Patel",
        last_login=datetime(2026, 9, 1),
    )
    report = await run(dest, [returned, newer])

    assert report.conflicts == []
    holder = await dest["users"].find_one({"mobiles": "9876543210"})
    assert holder["username"] == f"user{UID_A}"
