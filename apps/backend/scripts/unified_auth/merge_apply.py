"""Turning a reviewed component into one account, or into several.

Every choice here is about what a real person loses. A merged account has one
username, one avatar and one primary number, and the rows it was built from had
their own. Picking badly is not a data problem -- it is someone signing in and
not recognising themselves.

The rule throughout is **most recently active wins**: whatever that person was
using last is what they will expect to see. Anything the winner does not have
is taken from the next row that does, rather than dropped.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Sequence, Set

from .identity_graph import Component, LegacyRow
from .normalise import normalise_email, normalise_mobile


@dataclass
class UnifiedAccount:
    """One account, ready to insert into the unified `users` collection."""

    username: str
    email: str
    emails: List[str]
    mobiles: List[str]
    google_ids: List[str]
    hashed_password: Optional[str]
    legacy_hashes: List[dict]
    legacy_accounts: List[dict]
    full_name: Optional[str] = None
    mobile: Optional[str] = None
    google_id: Optional[str] = None
    auth_provider: str = "password"
    is_active: bool = True
    is_verified: bool = False
    is_admin: bool = False
    is_platform_admin: bool = False
    merge_state: str = "clean"
    merge_group_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    # Resolved by phase 4 once the file has been copied into the unified
    # bucket; the id here still points into `avatar_source_db`.
    avatar_file_id: Optional[str] = None
    avatar_url: Optional[str] = None
    avatar_source_db: Optional[str] = None
    # The rows this account was built from, in the order they were considered.
    source_rows: List[LegacyRow] = field(default_factory=list)


@dataclass
class MembershipPlan:
    """One (person, tournament) row, built from one legacy account."""

    tournament_slug: str
    source_db: str
    legacy_user_id: str
    display_name: str
    role: str
    joined_at: Optional[datetime]
    last_login_at: Optional[datetime]


def _activity(row: LegacyRow) -> datetime:
    """When this account was last plausibly used."""
    stamps = [d for d in (row.last_login, row.updated_at, row.created_at) if d]
    return max(stamps) if stamps else datetime.min


def rows_by_recency(rows: Sequence[LegacyRow]) -> List[LegacyRow]:
    """Most recently active first, ties broken deterministically.

    The tie-break matters more than it looks: without it two runs of the
    migration over the same data could pick different winners, and "idempotent"
    would quietly stop being true.
    """
    return sorted(
        rows, key=lambda r: (_activity(r), r.source_db, r.legacy_user_id), reverse=True
    )


def _ordered_unique(values: Sequence[Optional[str]]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out


def build_unified_account(
    component: Component,
    platform_admin_keys: Optional[Set[str]] = None,
    merge_group_id: Optional[str] = None,
) -> UnifiedAccount:
    """Build one account from one component's rows.

    `platform_admin_keys` holds the emails and mobiles of the people who should
    administer the whole platform. Legacy `is_admin` deliberately does not grant
    it: merging means someone who administered one tournament would otherwise
    inherit every tournament, including ones they have never been near.
    """
    platform_admin_keys = platform_admin_keys or set()
    ranked = rows_by_recency(component.rows)
    winner = ranked[0]

    emails = _ordered_unique([normalise_email(r.email) or r.email for r in ranked])
    mobiles = _ordered_unique([normalise_mobile(r.mobile) for r in ranked])
    google_ids = _ordered_unique([r.google_id for r in ranked])

    # Every row's password stays valid. A merged account has more than one, and
    # the person remembers whichever they last used -- picking one and
    # discarding the rest locks out whoever guessed wrong.
    legacy_hashes = [
        {
            "hashed_password": r.hashed_password,
            "source_db": r.source_db,
            "legacy_user_id": r.legacy_user_id,
            "last_login": r.last_login,
        }
        for r in ranked[1:]
        if r.hashed_password
    ]

    def first_with(attr: str):
        """The most recently active row that actually has this, and its value."""
        for r in ranked:
            value = getattr(r, attr)
            if value:
                return r, value
        return None, None

    _, full_name = first_with("full_name")
    avatar_row, avatar_file_id = first_with("avatar_file_id")

    created = [r.created_at for r in ranked if r.created_at]
    logins = [r.last_login for r in ranked if r.last_login]

    is_platform_admin = any(
        (normalise_email(r.email) or "") in platform_admin_keys
        or (normalise_mobile(r.mobile) or "") in platform_admin_keys
        for r in ranked
    )

    return UnifiedAccount(
        username=winner.username,
        email=emails[0] if emails else winner.email,
        emails=emails,
        mobiles=mobiles,
        google_ids=google_ids,
        mobile=mobiles[0] if mobiles else None,
        google_id=google_ids[0] if google_ids else None,
        hashed_password=winner.hashed_password,
        legacy_hashes=legacy_hashes,
        full_name=full_name,
        auth_provider=(
            "google" if google_ids and not winner.hashed_password else "password"
        ),
        # Deactivated in one tournament and active in another means the person
        # is still around. Only an account that was disabled everywhere stays
        # disabled.
        is_active=any(r.is_active for r in ranked),
        is_verified=any(r.is_verified for r in ranked),
        is_admin=False,
        is_platform_admin=is_platform_admin,
        merge_state=component.flags and "needs_review" or "clean",
        merge_group_id=merge_group_id,
        # The oldest signup is when this person joined, whichever row it was.
        created_at=min(created) if created else None,
        updated_at=datetime.utcnow(),
        last_login=max(logins) if logins else None,
        avatar_file_id=avatar_file_id,
        avatar_source_db=avatar_row.source_db if avatar_row else None,
        legacy_accounts=[
            {
                "source_db": r.source_db,
                "legacy_user_id": r.legacy_user_id,
                "username": r.username,
                "email": r.email,
                "mobile": r.mobile,
                "created_at": r.created_at,
            }
            for r in ranked
        ],
        source_rows=ranked,
    )


def plan_accounts(
    component: Component,
    component_id: str,
    platform_admin_keys: Optional[Set[str]] = None,
) -> List[UnifiedAccount]:
    """The accounts this component becomes.

    A clean component becomes one account. A flagged one becomes **several** --
    one per legacy row, each carrying the same merge_group_id so a reviewer can
    find the set and link them deliberately. That is the whole point of
    flagging: the migration declines to guess, but leaves the question asked
    rather than silently dropping it.
    """
    if component.should_merge:
        return [build_unified_account(component, platform_admin_keys)]

    return [
        build_unified_account(
            Component(rows=[row], edges=[], flags=component.flags),
            platform_admin_keys,
            merge_group_id=component_id,
        )
        for row in rows_by_recency(component.rows)
    ]


def plan_memberships(
    account: UnifiedAccount, slug_by_db: Dict[str, str]
) -> List[MembershipPlan]:
    """One membership per legacy row, so every tournament shows on the profile.

    Role is per tournament: a legacy `is_admin` makes that person an admin of
    the tournament they administered, and of nothing else.
    """
    return [
        MembershipPlan(
            tournament_slug=slug_by_db[row.source_db],
            source_db=row.source_db,
            legacy_user_id=row.legacy_user_id,
            display_name=row.username,
            role="admin" if row.is_admin else "player",
            joined_at=row.created_at,
            last_login_at=row.last_login,
        )
        for row in account.source_rows
        if row.source_db in slug_by_db
    ]
