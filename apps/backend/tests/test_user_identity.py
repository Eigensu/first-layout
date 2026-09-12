"""User v2 identity arrays, legacy hashes, and the membership model.

None of this is wired into a route yet: resolving against `emails`/`mobiles`
before the backfill populates them would fail every login. These cover the
models and services on their own.
"""

import pytest
import pytest_asyncio
from beanie import PydanticObjectId

from app.models.tournament_membership import (
    ROLE_ADMIN,
    ROLE_PLAYER,
    STATUS_PLAYED,
    STATUS_REGISTERED,
    TournamentMembership,
)
from app.models.user import MERGE_STATE_CLEAN, LegacyHash, User
from app.services.auth.identity import (
    AmbiguousIdentifier,
    digits_only,
    promote_legacy_password,
    resolve_login_identity,
    verify_user_password,
)
from app.utils.security import get_password_hash, verify_password

CURRENT = "CurrentPass1"
OLD_LPCL = "OldLpclPass1"
OLD_FIFTH = "OldFifthPass1"

TOURNAMENT_A = PydanticObjectId()
TOURNAMENT_B = PydanticObjectId()


@pytest_asyncio.fixture
async def merged_user(db):
    """One person who played two tournaments under two different logins."""
    user = User(
        username="rahul",
        email="rahul@example.com",
        mobile="9876543210",
        emails=["rahul@example.com", "r.patel@example.com"],
        mobiles=["9876543210", "9123456789"],
        hashed_password=get_password_hash(CURRENT),
        legacy_hashes=[
            LegacyHash(
                hashed_password=get_password_hash(OLD_LPCL),
                source_db="walle_lpcl",
                legacy_user_id=PydanticObjectId(),
            ),
            LegacyHash(
                hashed_password=get_password_hash(OLD_FIFTH),
                source_db="walle_fifth",
                legacy_user_id=PydanticObjectId(),
            ),
        ],
    )
    await user.insert()
    return user


# --------------------------------------------------------------------------
# identity resolution
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolves_by_either_mobile(merged_user):
    for number in ("9876543210", "9123456789"):
        found = await resolve_login_identity(number)
        assert found is not None and found.id == merged_user.id


@pytest.mark.asyncio
async def test_resolves_by_either_email(merged_user):
    for address in ("rahul@example.com", "r.patel@example.com"):
        found = await resolve_login_identity(address)
        assert found is not None and found.id == merged_user.id


@pytest.mark.asyncio
async def test_mobile_resolution_tolerates_formatting(merged_user):
    found = await resolve_login_identity("+91 98765 43210")
    assert found is not None and found.id == merged_user.id


@pytest.mark.asyncio
async def test_email_resolution_is_case_insensitive(merged_user):
    found = await resolve_login_identity("RAHUL@Example.com")
    assert found is not None and found.id == merged_user.id


@pytest.mark.asyncio
async def test_unique_username_still_resolves(merged_user):
    found = await resolve_login_identity("rahul")
    assert found is not None and found.id == merged_user.id


@pytest.mark.asyncio
async def test_ambiguous_username_is_refused_not_guessed(db):
    """The failure this whole design exists to avoid.

    Two people held "rahul" in two different tournaments. Picking the first
    match would sign one of them into the other's account.
    """
    for i in (1, 2):
        await User(
            username="rahul",
            email=f"rahul{i}@example.com",
            emails=[f"rahul{i}@example.com"],
            hashed_password=get_password_hash(CURRENT),
        ).insert()

    with pytest.raises(AmbiguousIdentifier):
        await resolve_login_identity("rahul")


@pytest.mark.asyncio
async def test_unknown_identifier_returns_none(db):
    assert await resolve_login_identity("nobody@example.com") is None
    assert await resolve_login_identity("") is None


def test_digits_only_rejects_unicode_numerals():
    """Arabic-Indic digits would be stored verbatim and never match ASCII."""
    assert digits_only("+91 98765-43210") == "919876543210"
    assert digits_only("٩٨٧٦٥") == ""


# --------------------------------------------------------------------------
# passwords
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_primary_password_works(merged_user):
    assert verify_user_password(merged_user, CURRENT) == (True, False)


@pytest.mark.asyncio
async def test_every_carried_over_password_works(merged_user):
    assert verify_user_password(merged_user, OLD_LPCL) == (True, True)
    assert verify_user_password(merged_user, OLD_FIFTH) == (True, True)


@pytest.mark.asyncio
async def test_wrong_password_fails(merged_user):
    assert verify_user_password(merged_user, "NotTheirs1") == (False, False)


@pytest.mark.asyncio
async def test_promotion_leaves_exactly_one_password(merged_user):
    await promote_legacy_password(merged_user, OLD_LPCL)

    stored = await User.get(merged_user.id)
    assert stored.legacy_hashes == []
    assert verify_password(OLD_LPCL, stored.hashed_password)
    # The others stop working, which is the point: the window closes the first
    # time the account is used.
    assert verify_user_password(stored, CURRENT) == (False, False)
    assert verify_user_password(stored, OLD_FIFTH) == (False, False)


@pytest.mark.asyncio
async def test_promotion_rehashes_rather_than_copying(merged_user):
    original = merged_user.legacy_hashes[0].hashed_password
    await promote_legacy_password(merged_user, OLD_LPCL)

    stored = await User.get(merged_user.id)
    assert stored.hashed_password != original


@pytest.mark.asyncio
async def test_google_only_account_has_no_password(db):
    user = User(
        username="googler",
        email="g@example.com",
        emails=["g@example.com"],
        google_ids=["google-sub-1"],
        hashed_password=None,
    )
    await user.insert()
    assert verify_user_password(user, "anything") == (False, False)


# --------------------------------------------------------------------------
# model shape
# --------------------------------------------------------------------------


def test_identity_arrays_default_empty_until_backfill():
    for field in ("emails", "mobiles", "google_ids", "legacy_hashes"):
        assert User.model_fields[field].default_factory() == []


def test_is_admin_is_kept_alongside_is_platform_admin():
    """is_admin still gates every admin route; removing it now locks admins out."""
    assert User.model_fields["is_admin"].default is False
    assert User.model_fields["is_platform_admin"].default is False


def test_merge_state_defaults_to_clean():
    assert User.model_fields["merge_state"].default == MERGE_STATE_CLEAN


@pytest.mark.parametrize("name", ["uniq_emails", "uniq_mobiles", "uniq_google_ids"])
def test_identity_indexes_are_unique_and_partial(name):
    """The partial filter is load-bearing, not a detail.

    Without it the unique index covers every document that has no array yet --
    which is all of them until the backfill runs -- so they all collide on the
    same missing key and index creation fails during init_beanie. The service
    would not start.
    """
    named = {
        idx.document.get("name"): idx
        for idx in User.Settings.indexes
        if hasattr(idx, "document")
    }
    index = named[name]
    field = name.replace("uniq_", "")
    assert index.document["unique"] is True
    assert index.document["partialFilterExpression"] == {
        f"{field}.0": {"$exists": True}
    }


# --------------------------------------------------------------------------
# memberships
# --------------------------------------------------------------------------


@pytest_asyncio.fixture
async def membership(db, merged_user):
    m = TournamentMembership(
        user_id=merged_user.id,
        tournament_id=TOURNAMENT_A,
        tournament_slug="lpcl",
        display_name="rahul",
    )
    await m.insert()
    return m


@pytest.mark.asyncio
async def test_membership_starts_registered(membership):
    assert membership.status == STATUS_REGISTERED
    assert membership.role == ROLE_PLAYER
    assert membership.first_played_at is None
    assert membership.stats.teams_count == 0


@pytest.mark.asyncio
async def test_one_person_can_hold_many_memberships(db, merged_user, membership):
    await TournamentMembership(
        user_id=merged_user.id,
        tournament_id=TOURNAMENT_B,
        tournament_slug="fifth",
        display_name="rahul7",
        status=STATUS_PLAYED,
    ).insert()

    mine = await TournamentMembership.find(
        TournamentMembership.user_id == merged_user.id
    ).to_list()

    assert {m.tournament_slug for m in mine} == {"lpcl", "fifth"}
    # The display name is per tournament, which is the point of the join table.
    assert {m.display_name for m in mine} == {"rahul", "rahul7"}


@pytest.mark.asyncio
async def test_admin_role_is_scoped_to_one_tournament(db, merged_user, membership):
    membership.role = ROLE_ADMIN
    await membership.save()

    await TournamentMembership(
        user_id=merged_user.id,
        tournament_id=TOURNAMENT_B,
        tournament_slug="fifth",
        display_name="rahul7",
    ).insert()

    admin_of = await TournamentMembership.find(
        TournamentMembership.user_id == merged_user.id,
        TournamentMembership.role == ROLE_ADMIN,
    ).to_list()

    assert [m.tournament_slug for m in admin_of] == ["lpcl"]


def test_membership_uniqueness_is_per_user_per_tournament():
    named = {
        idx.document.get("name"): idx
        for idx in TournamentMembership.Settings.indexes
        if hasattr(idx, "document")
    }
    index = named["uniq_user_per_tournament"]
    assert index.document["unique"] is True
    assert list(index.document["key"].items()) == [("user_id", 1), ("tournament_id", 1)]


def test_legacy_row_index_is_partial_so_new_memberships_do_not_collide():
    """Post-cutover memberships have no legacy row; without the filter they
    would all share the same missing key and only one could ever exist."""
    named = {
        idx.document.get("name"): idx
        for idx in TournamentMembership.Settings.indexes
        if hasattr(idx, "document")
    }
    index = named["uniq_legacy_row"]
    assert index.document["unique"] is True
    assert index.document["partialFilterExpression"] == {
        "legacy_user_id": {"$exists": True}
    }
