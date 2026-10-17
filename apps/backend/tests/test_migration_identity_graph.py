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
    rows_holding_junk,
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


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("+44 7911 123456", "447911123456"),
        ("447911123456", "447911123456"),
        ("+1 415 555 0123", "14155550123"),
        ("09876543210", "9876543210"),
    ],
)
def test_only_real_indian_prefixes_are_stripped(raw, expected):
    """UK 447911123456 is not the Indian 7911123456 (R4).

    Cutting every long number to its last ten digits handed foreign numbers
    an Indian one, and with it the account of whoever holds that.
    """
    assert normalise_mobile(raw) == expected


def test_a_foreign_number_does_not_join_an_indian_one():
    rows = [
        row(db="walle_lpcl", uid="1", mobile="+44 7911 123456", full_name="A B"),
        row(db="walle_fifth", uid="2", mobile="7911123456", full_name="A B"),
    ]
    components, _ = build_components(rows)

    assert len(components) == 2


def test_gmail_aliases_are_one_inbox_and_one_person():
    """Otherwise a migration meant to give this person one account gives three."""
    assert (
        normalise_email("rahul.patel@gmail.com")
        == normalise_email("rahulpatel@gmail.com")
        == normalise_email("rahul.patel+lpcl@gmail.com")
        == "rahulpatel@gmail.com"
    )


def test_plus_tags_are_significant_outside_gmail():
    """Elsewhere a +tag may be its own mailbox (R2)."""
    assert normalise_email("user+one@company.com") == "user+one@company.com"
    assert normalise_email("user+one@company.com") != normalise_email(
        "user+two@company.com"
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


def test_three_accounts_on_one_phone_are_one_person():
    """Every pair directly linked is not a chain, however many there are.

    Someone who played three tournaments on one number is the player the
    unified profile exists for. Holding size >= 3 back split 80 such people in
    the live data.
    """
    rows = [
        row(db=db, uid=str(i), mobile="9876543210", full_name="Rahul Patel")
        for i, db in enumerate(("walle_m11", "walle_lpcl", "walle_fifth"))
    ]
    components, _ = build_components(rows)

    assert components[0].size == 3
    assert "chained" not in components[0].flags
    assert components[0].should_merge


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


@pytest.mark.parametrize(
    "first,second",
    [
        ("Rahul Patel", "Rahul Patil"),  # similar, but not the same name
        ("Rahul Patel", None),  # nothing to compare
    ],
)
def test_a_phone_alone_needs_an_exact_name_to_merge(first, second):
    """Two different people with a common name pass a fuzzy match (R3).

    On a mobile-only edge -- no shared email -- only an exact name merges.
    """
    rows = [
        row(db="walle_lpcl", uid="1", mobile="9876543210", full_name=first),
        row(db="walle_fifth", uid="2", mobile="9876543210", full_name=second),
    ]
    components, _ = build_components(rows)

    assert "mobile_only_name_unconfirmed" in flags_of(components)
    assert not components[0].should_merge


def test_a_shared_email_needs_no_name_at_all():
    rows = [
        row(db="walle_lpcl", uid="1", email="r@corp.com", full_name=None),
        row(db="walle_fifth", uid="2", email="r@corp.com", full_name=None),
    ]
    components, _ = build_components(rows)

    assert components[0].should_merge


def test_shared_mobile_with_different_names_is_held_back():
    """A family sharing one phone is the common case in this market."""
    rows = [
        row(db="walle_lpcl", uid="1", mobile="9876543210", full_name="Rahul Patel"),
        row(db="walle_fifth", uid="2", mobile="9876543210", full_name="Priya Sharma"),
    ]
    components, _ = build_components(rows)

    assert "shared_mobile_diff_names" in flags_of(components)
    assert not components[0].should_merge


def test_one_google_sign_in_is_one_person_whatever_else_differs():
    """Google says who signed in. In the live data two accounts share one
    Google login but nothing usable besides: their address is on five
    accounts and discarded as junk."""
    rows = [
        row(db="Dcpl", uid="1", google_id="g-1", full_name="Rahul Patel"),
        row(db="rspl", uid="2", google_id="g-1", full_name="Rahul Patel"),
    ]
    components, _ = build_components(rows)

    assert len(components) == 1
    assert components[0].should_merge


def test_a_sign_in_id_is_never_junk_however_many_rows_hold_it():
    """A phone on eight accounts is a call centre; a Google login on eight is
    one person who played eight tournaments."""
    rows = [
        row(db=f"db{i}", uid=str(i), google_id="g-1", full_name="Rahul Patel")
        for i in range(5)
    ]
    components, junk = build_components(rows)

    assert len(components) == 1
    assert components[0].should_merge
    assert "g-1" not in junk


def test_one_apple_sign_in_is_one_person():
    rows = [
        row(db="Dcpl", uid="1", apple_id="a-1", full_name="Rahul Patel"),
        row(db="rspl", uid="2", apple_id="a-1", full_name="Rahul Patel"),
    ]
    components, _ = build_components(rows)

    assert len(components) == 1


def test_a_shared_sign_in_with_different_names_is_still_reviewed():
    rows = [
        row(db="Dcpl", uid="1", google_id="g-1", full_name="Rahul Patel"),
        row(db="rspl", uid="2", google_id="g-1", full_name="Priya Sharma"),
    ]
    components, _ = build_components(rows)

    assert "name_mismatch" in flags_of(components)


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


def test_rows_split_by_a_junk_key_can_still_be_found_for_review():
    """They are singletons, so the review queue never shows them."""
    rows = [
        row(db="walle_lpcl", uid=str(i), mobile="9876543210", full_name=f"P {i}")
        for i in range(5)
    ]
    components, junk = build_components(rows)

    holding = rows_holding_junk(rows, junk)

    assert all(not c.flags for c in components)
    assert [r.legacy_user_id for r in holding["9876543210"]] == [
        "0",
        "1",
        "2",
        "3",
        "4",
    ]


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


def test_an_exact_name_does_not_outweigh_a_wide_gap():
    """Matching names are common; two years apart, the number may be someone
    else's now (R3)."""
    rows = [
        row(
            db="walle_m11",
            uid="1",
            mobile="9876543210",
            full_name="Rahul Patel",
            created_at=JAN_2024,
            updated_at=MAR_2024,
            last_login=MAR_2024,
        ),
        row(
            db="walle_lpcl",
            uid="2",
            mobile="9876543210",
            full_name="Rahul Patel",
            created_at=JAN_2026,
            updated_at=MAR_2026,
            last_login=MAR_2026,
        ),
    ]
    components, _ = build_components(rows)

    assert flags_of(components) == ["possible_recycled_mobile"]


def test_recycle_gap_is_configurable():
    rows = [
        row(
            db="walle_lpcl",
            uid="1",
            mobile="9876543210",
            full_name="Rahul Patel",
            created_at=JAN_2024,
            updated_at=MAR_2024,
            last_login=MAR_2024,
        ),
        row(
            db="walle_fifth",
            uid="2",
            mobile="9876543210",
            full_name="Rahul Patel",
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
