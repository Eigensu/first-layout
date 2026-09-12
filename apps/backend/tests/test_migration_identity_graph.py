"""Which legacy accounts get merged, and which are held back for a human.

Every test here is a claim about real people. A false merge hands someone a
stranger's account; a false split is an inconvenience a human can undo. The
asymmetry is why almost everything doubtful ends up flagged.
"""

from datetime import datetime, timedelta

import pytest

from scripts.unified_auth.identity_graph import (
    RECYCLE_GAP,
    LegacyRow,
    build_components,
    gap_histogram,
    summarise,
)
from scripts.unified_auth.normalise import (
    normalise_email,
    normalise_mobile,
    normalise_name,
)

JAN_2024 = datetime(2024, 1, 10)
MAR_2024 = datetime(2024, 3, 20)
JUN_2024 = datetime(2024, 6, 1)
JAN_2026 = datetime(2026, 1, 15)
MAR_2026 = datetime(2026, 3, 30)


def row(db="walle_lpcl", uid="1", **kwargs) -> LegacyRow:
    defaults = dict(
        username="player",
        created_at=JAN_2024,
        updated_at=MAR_2024,
        last_login=MAR_2024,
    )
    defaults.update(kwargs)
    return LegacyRow(source_db=db, legacy_user_id=uid, **defaults)


def flags_of(components, index=0):
    return components[index].flags


# --------------------------------------------------------------------------
# normalisation -- the keys everything else is built on
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("9876543210", "9876543210"),
        ("+91 98765 43210", "9876543210"),
        ("919876543210", "9876543210"),
        ("98765-43210", "9876543210"),
    ],
)
def test_mobile_forms_reduce_to_one_key(raw, expected):
    assert normalise_mobile(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "",
        "12345",
        "0000000000",
        "1111111111",
        "2345678901",  # no Indian mobile starts below 6
        "1234567890123456",  # too long to be a phone
    ],
)
def test_junk_mobiles_identify_nobody(raw):
    assert normalise_mobile(raw) is None


def test_gmail_aliases_are_one_inbox_and_one_person():
    """Otherwise a migration meant to give this person one account gives three."""
    assert (
        normalise_email("rahul.patel@gmail.com")
        == normalise_email("rahulpatel@gmail.com")
        == normalise_email("rahul.patel+lpcl@gmail.com")
        == "rahulpatel@gmail.com"
    )


def test_dots_are_significant_outside_gmail():
    assert normalise_email("rahul.patel@company.com") != normalise_email(
        "rahulpatel@company.com"
    )


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "",
        "not-an-email",
        "test@test.com",
        "a@a.com",
        "user@example.com",
        "noreply@corp.com",
        "x@localhost",
    ],
)
def test_placeholder_emails_identify_nobody(raw):
    assert normalise_email(raw) is None


@pytest.mark.parametrize("raw", ["admin@gmail.com", "b@company.com", "na@corp.com"])
def test_plausible_looking_addresses_are_kept(raw):
    """The denylist deliberately does not guess.

    admin@gmail.com looks like a placeholder and may well be somebody's actual
    address. Rejecting it would split that person off from their own other
    account silently, with nothing in the review queue to notice it by. If an
    address really is shared, MAX_ROWS_PER_KEY catches it structurally --
    which needs no prediction about what junk looks like.
    """
    assert normalise_email(raw) is not None


def test_name_normalisation_ignores_case_and_punctuation():
    assert normalise_name("  Rahul  R. Patel ") == normalise_name("rahul r patel")


# --------------------------------------------------------------------------
# the merges that should happen
# --------------------------------------------------------------------------


def test_same_mobile_same_name_merges():
    rows = [
        row(db="walle_lpcl", uid="1", mobile="9876543210", full_name="Rahul Patel"),
        row(
            db="walle_fifth", uid="2", mobile="+91 98765 43210", full_name="Rahul Patel"
        ),
    ]
    components, _ = build_components(rows)

    assert len(components) == 1
    assert components[0].size == 2
    assert components[0].should_merge


def test_two_channels_agreeing_merges_whatever_the_gap():
    """Corroboration beats elapsed time: two identifiers agreeing is strong."""
    rows = [
        row(
            db="walle_m11",
            uid="1",
            mobile="9876543210",
            email="r@corp.com",
            created_at=JAN_2024,
            updated_at=MAR_2024,
            last_login=MAR_2024,
        ),
        row(
            db="walle_lpcl",
            uid="2",
            mobile="9876543210",
            email="r@corp.com",
            created_at=JAN_2026,
            updated_at=MAR_2026,
            last_login=MAR_2026,
        ),
    ]
    components, _ = build_components(rows)

    assert components[0].should_merge
    assert "possible_recycled_mobile" not in flags_of(components)


def test_unrelated_people_stay_separate():
    rows = [
        row(db="walle_lpcl", uid="1", mobile="9876543210", email="a@corp.com"),
        row(db="walle_fifth", uid="2", mobile="9123456789", email="b@corp.com"),
    ]
    components, _ = build_components(rows)

    assert len(components) == 2
    assert all(c.size == 1 for c in components)


# --------------------------------------------------------------------------
# the merges that must NOT happen automatically
# --------------------------------------------------------------------------


def test_chained_components_are_held_back():
    """A shares a number with B, B shares an address with C, A and C are strangers."""
    rows = [
        row(db="walle_m11", uid="1", mobile="9876543210", email="a@corp.com"),
        row(db="walle_lpcl", uid="2", mobile="9876543210", email="b@corp.com"),
        row(db="walle_fifth", uid="3", mobile="9123456789", email="b@corp.com"),
    ]
    components, _ = build_components(rows)

    assert components[0].size == 3
    assert "chained" in components[0].flags
    assert not components[0].should_merge


def test_shared_mobile_with_different_names_is_held_back():
    """A family sharing one phone is the common case in this market."""
    rows = [
        row(db="walle_lpcl", uid="1", mobile="9876543210", full_name="Rahul Patel"),
        row(db="walle_fifth", uid="2", mobile="9876543210", full_name="Priya Sharma"),
    ]
    components, _ = build_components(rows)

    assert "shared_mobile_diff_names" in flags_of(components)
    assert not components[0].should_merge


def test_two_google_accounts_in_one_component_is_held_back():
    rows = [
        row(db="walle_lpcl", uid="1", mobile="9876543210", google_id="google-a"),
        row(db="walle_fifth", uid="2", mobile="9876543210", google_id="google-b"),
    ]
    components, _ = build_components(rows)

    assert "multi_google" in flags_of(components)


def test_an_overshared_key_merges_nobody():
    """Eight accounts on one number is a call centre, not a person.

    Without this the component would be all eight, and one person would end up
    holding every one of those logins.
    """
    rows = [
        row(db="walle_lpcl", uid=str(i), mobile="9876543210", full_name=f"Player {i}")
        for i in range(8)
    ]
    components, junk = build_components(rows)

    assert len(components) == 8
    assert all(c.size == 1 for c in components)
    assert "9876543210" in junk


def test_placeholder_email_does_not_chain_strangers():
    rows = [
        row(db="walle_lpcl", uid="1", email="test@test.com", mobile="9876543210"),
        row(db="walle_fifth", uid="2", email="test@test.com", mobile="9123456789"),
    ]
    components, _ = build_components(rows)

    assert len(components) == 2


# --------------------------------------------------------------------------
# recycled numbers
# --------------------------------------------------------------------------


def test_uncorroborated_mobile_across_a_wide_gap_is_held_back():
    """Two years apart, one shared number, nothing else agreeing.

    Consistent with a reallocated number, so it goes to a human rather than
    being merged on the strength of the number alone.
    """
    rows = [
        row(
            db="walle_m11",
            uid="1",
            mobile="9876543210",
            full_name=None,
            created_at=JAN_2024,
            updated_at=MAR_2024,
            last_login=MAR_2024,
        ),
        row(
            db="walle_lpcl",
            uid="2",
            mobile="9876543210",
            full_name=None,
            created_at=JAN_2026,
            updated_at=MAR_2026,
            last_login=MAR_2026,
        ),
    ]
    components, _ = build_components(rows)

    assert "possible_recycled_mobile" in flags_of(components)
    assert not components[0].should_merge


def test_a_seasonal_return_still_merges():
    """The trap this heuristic has to avoid.

    Ten months between two tournaments is what an ordinary returning player
    looks like. Flagging those would put most of the real merges in the
    review queue and make the queue useless.
    """
    rows = [
        row(
            db="walle_lpcl",
            uid="1",
            mobile="9876543210",
            full_name="Rahul Patel",
            created_at=JAN_2024,
            updated_at=JUN_2024,
            last_login=JUN_2024,
        ),
        row(
            db="walle_fifth",
            uid="2",
            mobile="9876543210",
            full_name="Rahul Patel",
            created_at=datetime(2025, 4, 1),
            updated_at=datetime(2025, 6, 1),
            last_login=datetime(2025, 6, 1),
        ),
    ]
    components, _ = build_components(rows)

    assert components[0].should_merge


def test_overlapping_activity_is_never_a_recycled_number():
    rows = [
        row(
            db="walle_lpcl",
            uid="1",
            mobile="9876543210",
            full_name=None,
            created_at=JAN_2024,
            updated_at=JUN_2024,
            last_login=JUN_2024,
        ),
        row(
            db="walle_fifth",
            uid="2",
            mobile="9876543210",
            full_name=None,
            created_at=MAR_2024,
            updated_at=JUN_2024,
            last_login=JUN_2024,
        ),
    ]
    components, _ = build_components(rows)

    assert "possible_recycled_mobile" not in flags_of(components)


def test_missing_dates_are_not_treated_as_evidence():
    """Unknown is not the same as far apart."""
    rows = [
        row(
            db="walle_lpcl",
            uid="1",
            mobile="9876543210",
            full_name=None,
            created_at=None,
            updated_at=None,
            last_login=None,
        ),
        row(db="walle_fifth", uid="2", mobile="9876543210", full_name=None),
    ]
    components, _ = build_components(rows)

    assert "possible_recycled_mobile" not in flags_of(components)


def test_recycle_gap_is_configurable():
    rows = [
        row(
            db="walle_lpcl",
            uid="1",
            mobile="9876543210",
            full_name=None,
            created_at=JAN_2024,
            updated_at=MAR_2024,
            last_login=MAR_2024,
        ),
        row(
            db="walle_fifth",
            uid="2",
            mobile="9876543210",
            full_name=None,
            created_at=JUN_2024,
            updated_at=JUN_2024,
            last_login=JUN_2024,
        ),
    ]
    assert build_components(rows, recycle_gap=RECYCLE_GAP)[0][0].should_merge
    tight = build_components(rows, recycle_gap=timedelta(days=30))[0][0]
    assert "possible_recycled_mobile" in tight.flags


# --------------------------------------------------------------------------
# the report a human reads before agreeing to any of this
# --------------------------------------------------------------------------


def test_summary_counts_what_a_reviewer_needs():
    rows = [
        row(db="walle_lpcl", uid="1", mobile="9876543210", full_name="Rahul Patel"),
        row(db="walle_fifth", uid="2", mobile="9876543210", full_name="Rahul Patel"),
        row(db="walle_lpcl", uid="3", mobile="9111111112", full_name="Priya Sharma"),
        row(db="walle_fifth", uid="4", mobile="9111111112", full_name="Amit Kumar"),
        row(db="walle_m11", uid="5", mobile="9222222223", full_name="Solo Player"),
    ]
    components, junk = build_components(rows)
    summary = summarise(components, junk)

    assert summary["legacy_rows"] == 5
    assert summary["auto_merge_components"] == 1
    assert summary["accounts_absorbed_by_merges"] == 1
    assert summary["flagged_components"] == 1
    assert summary["flag_counts"]["shared_mobile_diff_names"] == 1
    assert summary["singletons"] == 1


def test_gap_histogram_is_emitted_so_the_threshold_is_chosen_not_guessed():
    rows = [
        row(
            db="walle_lpcl",
            uid="1",
            mobile="9876543210",
            full_name=None,
            created_at=JAN_2024,
            updated_at=MAR_2024,
            last_login=MAR_2024,
        ),
        row(
            db="walle_fifth",
            uid="2",
            mobile="9876543210",
            full_name=None,
            created_at=JAN_2026,
            updated_at=MAR_2026,
            last_login=MAR_2026,
        ),
    ]
    components, _ = build_components(rows)

    histogram = gap_histogram(components)
    assert sum(histogram.values()) == 1
    # Mar 2024 to Jan 2026 is a little under two years.
    assert histogram["<730d"] == 1


def test_nothing_is_merged_by_building_the_plan():
    """The phase is a proposal. It reads rows and returns objects; that is all."""
    rows = [
        row(db="walle_lpcl", uid="1", mobile="9876543210"),
        row(db="walle_fifth", uid="2", mobile="9876543210"),
    ]
    components, _ = build_components(rows)

    assert [r.key for r in components[0].rows] == [
        ("walle_fifth", "2"),
        ("walle_lpcl", "1"),
    ]
