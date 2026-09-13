"""Building one account from several, and moving the game data across.

The identity graph decides *who* merges. This decides what the merged person
ends up with -- which username, which avatar, which password still works -- and
what, in one case, they lose.
"""

from datetime import datetime

import pytest
from bson import ObjectId

from scripts.unified_auth.identity_graph import Component, LegacyRow
from scripts.unified_auth.merge_apply import (
    build_unified_account,
    plan_accounts,
    plan_memberships,
    rows_by_recency,
)
from scripts.unified_auth.tenant_import import (
    REMOVED,
    remap_document,
    resolve_enrollment_collisions,
)

OLD = datetime(2024, 2, 1)
RECENT = datetime(2026, 2, 1)

SLUGS = {"walle_lpcl": "lpcl", "walle_fifth": "fifth"}


def row(db, uid, **kwargs) -> LegacyRow:
    defaults = dict(
        username=f"user{uid}", created_at=OLD, updated_at=OLD, last_login=OLD
    )
    defaults.update(kwargs)
    return LegacyRow(source_db=db, legacy_user_id=uid, **defaults)


def component(*rows, flags=None) -> Component:
    return Component(rows=list(rows), edges=[], flags=flags or [])


# --------------------------------------------------------------------------
# which row wins
# --------------------------------------------------------------------------


def test_most_recently_active_row_wins():
    stale = row("walle_lpcl", "1", username="oldname", last_login=OLD)
    fresh = row("walle_fifth", "2", username="currentname", last_login=RECENT)

    account = build_unified_account(component(stale, fresh))

    assert account.username == "currentname"


def test_ranking_is_deterministic_when_activity_ties():
    """Without a tie-break, two runs could pick different winners.

    That would quietly make the migration non-idempotent -- re-running it after
    a partial failure would produce a different account.
    """
    a = row("walle_lpcl", "1", last_login=OLD)
    b = row("walle_fifth", "2", last_login=OLD)

    assert [r.key for r in rows_by_recency([a, b])] == [
        r.key for r in rows_by_recency([b, a])
    ]


def test_fields_the_winner_lacks_come_from_the_next_row_that_has_them():
    fresh = row(
        "walle_fifth", "2", last_login=RECENT, full_name=None, avatar_file_id=None
    )
    stale = row(
        "walle_lpcl",
        "1",
        last_login=OLD,
        full_name="Rahul Patel",
        avatar_file_id="avatar-abc",
    )

    account = build_unified_account(component(fresh, stale))

    assert account.full_name == "Rahul Patel"
    assert account.avatar_file_id == "avatar-abc"
    assert account.avatar_source_db == "walle_lpcl"


# --------------------------------------------------------------------------
# credentials
# --------------------------------------------------------------------------


def test_every_password_survives_the_merge():
    fresh = row("walle_fifth", "2", last_login=RECENT, hashed_password="hash-fifth")
    stale = row("walle_lpcl", "1", last_login=OLD, hashed_password="hash-lpcl")

    account = build_unified_account(component(fresh, stale))

    assert account.hashed_password == "hash-fifth"
    assert [h["hashed_password"] for h in account.legacy_hashes] == ["hash-lpcl"]


def test_passwordless_rows_contribute_no_legacy_hash():
    fresh = row("walle_fifth", "2", last_login=RECENT, hashed_password="hash-fifth")
    google = row(
        "walle_lpcl", "1", last_login=OLD, hashed_password=None, google_id="g-1"
    )

    account = build_unified_account(component(fresh, google))

    assert account.legacy_hashes == []
    assert account.google_ids == ["g-1"]


def test_identity_arrays_are_the_union_winner_first():
    fresh = row(
        "walle_fifth", "2", last_login=RECENT, email="new@corp.com", mobile="9876543210"
    )
    stale = row(
        "walle_lpcl", "1", last_login=OLD, email="old@corp.com", mobile="9123456789"
    )

    account = build_unified_account(component(fresh, stale))

    assert account.emails == ["new@corp.com", "old@corp.com"]
    assert account.mobiles == ["9876543210", "9123456789"]
    assert account.email == "new@corp.com"
    assert account.mobile == "9876543210"


def test_the_same_phone_in_two_formats_is_one_entry():
    a = row("walle_fifth", "2", last_login=RECENT, mobile="919876543210")
    b = row("walle_lpcl", "1", last_login=OLD, mobile="+91 98765 43210")

    assert build_unified_account(component(a, b)).mobiles == ["9876543210"]


# --------------------------------------------------------------------------
# status and privilege
# --------------------------------------------------------------------------


def test_active_anywhere_means_active():
    disabled = row("walle_lpcl", "1", is_active=False)
    active = row("walle_fifth", "2", is_active=True, last_login=RECENT)

    assert build_unified_account(component(disabled, active)).is_active


def test_disabled_everywhere_stays_disabled():
    rows = [
        row("walle_lpcl", "1", is_active=False),
        row("walle_fifth", "2", is_active=False),
    ]
    assert not build_unified_account(component(*rows)).is_active


def test_legacy_admin_does_not_become_a_platform_admin():
    """The privilege escalation the whole role split exists to prevent.

    Someone who administered one tournament must not inherit every tournament
    by virtue of their accounts being merged.
    """
    admin_somewhere = row("walle_lpcl", "1", is_admin=True, email="them@corp.com")

    account = build_unified_account(
        component(admin_somewhere), platform_admin_keys=set()
    )

    assert account.is_platform_admin is False
    assert account.is_admin is False


def test_platform_admin_comes_only_from_the_allowlist():
    listed = row("walle_lpcl", "1", email="boss@corp.com")
    account = build_unified_account(
        component(listed), platform_admin_keys={"boss@corp.com"}
    )
    assert account.is_platform_admin is True


def test_earliest_signup_is_kept_as_created_at():
    first = row("walle_lpcl", "1", created_at=OLD)
    later = row("walle_fifth", "2", created_at=RECENT, last_login=RECENT)

    assert build_unified_account(component(first, later)).created_at == OLD


# --------------------------------------------------------------------------
# flagged components are not merged
# --------------------------------------------------------------------------


def test_a_flagged_component_becomes_separate_accounts():
    rows = [row("walle_lpcl", "1"), row("walle_fifth", "2")]

    accounts = plan_accounts(component(*rows, flags=["chained"]), "c000001")

    assert len(accounts) == 2
    assert all(a.merge_state == "needs_review" for a in accounts)
    # Same group id on both, so a reviewer can find the set and link them.
    assert {a.merge_group_id for a in accounts} == {"c000001"}


def test_a_clean_component_becomes_one_account():
    accounts = plan_accounts(
        component(row("walle_lpcl", "1"), row("walle_fifth", "2")), "c000002"
    )

    assert len(accounts) == 1
    assert accounts[0].merge_state == "clean"
    assert accounts[0].merge_group_id is None


# --------------------------------------------------------------------------
# memberships
# --------------------------------------------------------------------------


def test_one_membership_per_legacy_row():
    account = build_unified_account(
        component(
            row("walle_lpcl", "1", username="rahul"),
            row("walle_fifth", "2", username="rahul7", last_login=RECENT),
        )
    )

    memberships = plan_memberships(account, SLUGS)

    assert {m.tournament_slug for m in memberships} == {"lpcl", "fifth"}
    # The name is per tournament, which is why it lives on the membership.
    assert {m.display_name for m in memberships} == {"rahul", "rahul7"}


def test_admin_role_lands_only_on_the_tournament_they_administered():
    account = build_unified_account(
        component(
            row("walle_lpcl", "1", is_admin=True),
            row("walle_fifth", "2", is_admin=False, last_login=RECENT),
        )
    )

    roles = {m.tournament_slug: m.role for m in plan_memberships(account, SLUGS)}

    assert roles == {"lpcl": "admin", "fifth": "player"}


# --------------------------------------------------------------------------
# the one place merging takes something away
# --------------------------------------------------------------------------


def enrollment(eid, user, contest, enrolled_at, status="active"):
    return {
        "_id": ObjectId(eid),
        "user_id": ObjectId(user),
        "contest_id": ObjectId(contest),
        "status": status,
        "enrolled_at": enrolled_at,
    }


def test_two_teams_in_one_contest_keeps_the_most_recent():
    """uniq_active_user_per_contest allows one active team per user per contest.

    Both of these were legitimate before the merge, and afterwards only one can
    be. The later enrolment is the squad that person last chose to field.
    """
    a, b = "a" * 24, "b" * 24
    contest = "c" * 24
    user_map = {("walle_lpcl", a): "f" * 24, ("walle_lpcl", b): "f" * 24}

    collisions, demote = resolve_enrollment_collisions(
        [
            enrollment("1" * 24, a, contest, OLD),
            enrollment("2" * 24, b, contest, RECENT),
        ],
        user_map,
        "walle_lpcl",
    )

    assert len(collisions) == 1
    assert collisions[0].kept_enrollment_id == "2" * 24
    assert collisions[0].removed_enrollment_ids == ["1" * 24]
    assert demote == {"1" * 24: REMOVED}


def test_different_contests_do_not_collide():
    a, b = "a" * 24, "b" * 24
    user_map = {("walle_lpcl", a): "f" * 24, ("walle_lpcl", b): "f" * 24}

    collisions, demote = resolve_enrollment_collisions(
        [
            enrollment("1" * 24, a, "c" * 24, OLD),
            enrollment("2" * 24, b, "d" * 24, RECENT),
        ],
        user_map,
        "walle_lpcl",
    )

    assert collisions == [] and demote == {}


def test_already_removed_enrollments_are_not_collisions():
    a, b = "a" * 24, "b" * 24
    contest = "c" * 24
    user_map = {("walle_lpcl", a): "f" * 24, ("walle_lpcl", b): "f" * 24}

    collisions, _ = resolve_enrollment_collisions(
        [
            enrollment("1" * 24, a, contest, OLD, status="removed"),
            enrollment("2" * 24, b, contest, RECENT),
        ],
        user_map,
        "walle_lpcl",
    )

    assert collisions == []


# --------------------------------------------------------------------------
# tagging and remapping
# --------------------------------------------------------------------------


def test_remap_tags_and_repoints_and_keeps_the_old_id():
    tournament = ObjectId()
    legacy_user = ObjectId()
    new_user = ObjectId()

    doc, missed = remap_document(
        {"_id": ObjectId(), "user_id": legacy_user, "team_name": "XI"},
        "teams",
        tournament,
        {("walle_lpcl", str(legacy_user)): str(new_user)},
        "walle_lpcl",
    )

    assert not missed
    assert doc["tournament_id"] == tournament
    assert doc["user_id"] == new_user
    # Kept so phase 3 is reversible without consulting user_id_map.
    assert doc["legacy_user_id"] == legacy_user


def test_string_user_references_stay_strings():
    """import_logs.user_id is declared str; an ObjectId there breaks every read."""
    legacy_user, new_user = ObjectId(), ObjectId()

    doc, _ = remap_document(
        {"_id": ObjectId(), "user_id": str(legacy_user)},
        "import_logs",
        ObjectId(),
        {("walle_lpcl", str(legacy_user)): str(new_user)},
        "walle_lpcl",
    )

    assert doc["user_id"] == str(new_user)
    assert isinstance(doc["user_id"], str)


def test_an_unmapped_reference_is_reported_not_silently_kept():
    doc, missed = remap_document(
        {"_id": ObjectId(), "user_id": ObjectId()},
        "teams",
        ObjectId(),
        {},
        "walle_lpcl",
    )

    assert missed is True


def test_collections_without_a_user_reference_are_only_tagged():
    tournament = ObjectId()
    doc, missed = remap_document(
        {"_id": ObjectId(), "code": "FINAL"}, "contests", tournament, {}, "walle_lpcl"
    )

    assert not missed
    assert doc["tournament_id"] == tournament
    assert "legacy_user_id" not in doc
