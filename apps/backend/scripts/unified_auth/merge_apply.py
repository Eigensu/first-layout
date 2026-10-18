"""Turning a reviewed component into one account, or into several.

Every choice here is about what a real person loses. A merged account has one
username, one avatar and one primary number, and the rows it was built from had
their own. Picking badly is not a data problem -- it is someone signing in and
not recognising themselves.

The rule throughout is **most recently active wins**: whatever that person was
using last is what they will expect to see. Anything the winner does not have
is taken from the next row that does, rather than dropped. A row its owner
deleted never wins, and never contributes a way in (spec §13.2, R1).
"""

import csv
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from .identity_graph import Component, LegacyRow
from .normalise import normalise_email, normalise_mobile

# Where an account whose only address was given to someone else gets one. The
# User model requires an email, and a placeholder on a domain this product owns
# can never reach a stranger -- unlike reusing the shared address, or inventing
# one on a domain anybody could register.
UNCLAIMED_EMAIL_DOMAIN = "unclaimed.wallearena.com"


@dataclass
class UnifiedAccount:
    """One account, ready to insert into the unified `users` collection."""

    username: str
    email: str
    emails: List[str]
    mobiles: List[str]
    google_ids: List[str]
    apple_ids: List[str]
    hashed_password: Optional[str]
    legacy_hashes: List[dict]
    legacy_accounts: List[dict]
    full_name: Optional[str] = None
    mobile: Optional[str] = None
    google_id: Optional[str] = None
    apple_id: Optional[str] = None
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
    # GridFS ids are preserved when phase 4 copies the file, so this id is
    # already the one the unified bucket will hold.
    avatar_file_id: Optional[str] = None
    avatar_source_db: Optional[str] = None
    # The rows this account was built from, in the order they were considered.
    source_rows: List[LegacyRow] = field(default_factory=list)


@dataclass
class MembershipPlan:
    """One (person, tournament) row."""

    tournament_slug: str
    source_db: str
    legacy_user_id: str
    display_name: str
    role: str
    joined_at: Optional[datetime]
    last_login_at: Optional[datetime]


@dataclass
class Withheld:
    """A login key no account in a flagged group was given, or only one was."""

    kind: str  # "email" | "mobile" | "google_id" | "apple_id"
    value: str
    kept_by: Optional[Tuple[str, str]]  # the row that kept it, or None
    held_by: List[Tuple[str, str]]


@dataclass
class AccountPlan:
    """What one component becomes, and what a reviewer needs to know about it."""

    accounts: List[UnifiedAccount]
    withheld: List[Withheld] = field(default_factory=list)
    flags: List[str] = field(default_factory=list)
    # A person has ruled on this flagged group (--links).
    reviewed: bool = False


def _activity(row: LegacyRow) -> datetime:
    """When this account was last plausibly used."""
    stamps = [d for d in (row.last_login, row.updated_at, row.created_at) if d]
    return max(stamps) if stamps else datetime.min


def rows_by_recency(rows: Sequence[LegacyRow]) -> List[LegacyRow]:
    """Live rows first, each group most recently active first.

    A deleted row sorts after every live one whatever its timestamps -- and a
    soft delete stamps updated_at, so by recency alone the row someone has just
    deleted would be the one most likely to win.

    The tie-break matters more than it looks: without it two runs of the
    migration over the same data could pick different winners, and "idempotent"
    would quietly stop being true.
    """
    return sorted(
        rows,
        key=lambda r: (r.is_active, _activity(r), r.source_db, r.legacy_user_id),
        reverse=True,
    )


def _ordered_unique(values: Iterable[Optional[str]]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out


def _email_key(row: LegacyRow) -> Optional[str]:
    return normalise_email(row.email)


def _mobile_key(row: LegacyRow) -> Optional[str]:
    return normalise_mobile(row.mobile)


def _address_as_typed(row: LegacyRow) -> Optional[str]:
    """The address as its owner types it, lowercased -- the form login looks up.

    The normalised form is for deciding who is who: it folds Gmail's dots, so
    rahul.patel@gmail.com becomes rahulpatel@gmail.com. Storing that would lock
    the person out, because login compares what they type, and they type the
    dots. Registration and Google sign-in store the typed form too.
    """
    if not _email_key(row):
        return None
    return row.email.strip().lower()


def build_unified_account(
    component: Component,
    platform_admin_keys: Optional[Set[str]] = None,
    merge_group_id: Optional[str] = None,
    withheld: Iterable[str] = (),
    merge_state: Optional[str] = None,
) -> UnifiedAccount:
    """Build one account from one component's rows.

    `platform_admin_keys` holds the normalised emails and mobiles of the people
    who should administer the whole platform. Legacy `is_admin` deliberately
    does not grant it: merging means someone who administered one tournament
    would otherwise inherit every tournament, including ones they have never
    been near.

    `withheld` holds normalised emails and mobiles, and Google and Apple ids, that this
    account must not carry: junk keys shared too widely to identify anyone, and
    in a split group the values another account kept.
    """
    platform_admin_keys = platform_admin_keys or set()
    withheld = set(withheld)
    ranked = rows_by_recency(component.rows)
    winner = ranked[0]

    # A deleted row contributes no credential: no password, legacy or primary,
    # and no Google or Apple sign-in. Its owner asked for that account to stop working,
    # and merging must not quietly reopen it through the account it joins.
    live = [r for r in ranked if r.is_active]

    emails = _ordered_unique(
        _address_as_typed(r) for r in ranked if _email_key(r) not in withheld
    )
    mobiles = _ordered_unique(
        _mobile_key(r) for r in ranked if _mobile_key(r) not in withheld
    )
    google_ids = _ordered_unique(
        r.google_id for r in live if r.google_id not in withheld
    )
    apple_ids = _ordered_unique(r.apple_id for r in live if r.apple_id not in withheld)

    # Every live row's password stays valid. A merged account has more than one,
    # and the person remembers whichever they last used -- picking one and
    # discarding the rest locks out whoever guessed wrong.
    hashed_password = live[0].hashed_password if live else None
    legacy_hashes = [
        {
            "hashed_password": r.hashed_password,
            "source_db": r.source_db,
            "legacy_user_id": r.legacy_user_id,
            "last_login": r.last_login,
        }
        for r in live[1:]
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

    # Only through a key this account keeps. In a split group, a phone shared
    # by two people goes to one of them; the other must not become a platform
    # admin through the row that phone was taken from.
    is_platform_admin = any(
        key in platform_admin_keys
        for r in ranked
        for key in (_email_key(r), _mobile_key(r))
        if key and key not in withheld
    )

    return UnifiedAccount(
        username=winner.username,
        email=_scalar_email(winner, emails, withheld),
        emails=emails,
        mobiles=mobiles,
        google_ids=google_ids,
        apple_ids=apple_ids,
        mobile=mobiles[0] if mobiles else None,
        google_id=google_ids[0] if google_ids else None,
        apple_id=apple_ids[0] if apple_ids else None,
        hashed_password=hashed_password,
        legacy_hashes=legacy_hashes,
        full_name=full_name,
        auth_provider=(
            "password"
            if hashed_password
            else "google" if google_ids else "apple" if apple_ids else "password"
        ),
        # Deactivated in one tournament and active in another means the person
        # is still around. Only an account that was disabled everywhere stays
        # disabled -- and, having no live row, it carries no credential either.
        is_active=bool(live),
        is_verified=any(r.is_verified for r in ranked),
        is_admin=False,
        is_platform_admin=is_platform_admin,
        merge_state=merge_state or (component.flags and "needs_review" or "clean"),
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
                "is_active": r.is_active,
                "created_at": r.created_at,
            }
            for r in ranked
        ],
        source_rows=ranked,
    )


def _scalar_email(winner: LegacyRow, emails: List[str], withheld: Set[str]) -> str:
    """The `email` field, which the User model requires.

    The first identity address when there is one. Otherwise the winner's own
    value, kept as it was -- a placeholder like test@test.com identifies
    nobody, but it is what the account held and `email` is not unique. Only an
    address this account was denied is replaced, so that it cannot be reached
    through the field the array was denied it in.
    """
    if emails:
        return emails[0]
    if winner.email and _email_key(winner) not in withheld:
        return winner.email.strip().lower()
    return f"{winner.legacy_user_id}@{UNCLAIMED_EMAIL_DOMAIN}"


def _contested(rows: Sequence[LegacyRow]) -> List[Withheld]:
    """Login keys held by more than one row of a group that is being split.

    Each goes to the most recently active live row holding it (decided for
    R8); the others lose it. Live rows rank first, so a deleted account never
    keeps a key from a live one.
    """
    holders: Dict[Tuple[str, str], List[LegacyRow]] = defaultdict(list)
    for r in rows_by_recency(rows):
        for kind, value in (
            ("email", _email_key(r)),
            ("mobile", _mobile_key(r)),
            ("google_id", r.google_id),
            ("apple_id", r.apple_id),
        ):
            if value:
                holders[(kind, value)].append(r)

    return [
        Withheld(
            kind=kind,
            value=value,
            kept_by=held[0].key,
            held_by=[r.key for r in held],
        )
        for (kind, value), held in holders.items()
        if len(held) > 1
    ]


def plan_accounts(
    component: Component,
    merge_group_id: str,
    platform_admin_keys: Optional[Set[str]] = None,
    junk: Iterable[str] = (),
    links: Optional[Dict[Tuple[str, str], str]] = None,
) -> AccountPlan:
    """The accounts this component becomes.

    A clean component becomes one account. A flagged one becomes **several** --
    one per legacy row, each carrying the same merge_group_id so a reviewer can
    find the set and link them deliberately. That is the whole point of
    flagging: the migration declines to guess, but leaves the question asked
    rather than silently dropping it.

    `links` holds the reviewer's answer, row key -> label (see load_links).
    Rows of this component with the same label become one account; rows
    without one stay on their own. Labels are compared within a component
    only, so "a" in one group and "a" in another are unrelated.

    Splitting has a catch: the rows were grouped because they share a mobile or
    an email, and a login key can belong to one account only. Each shared key
    goes to the account holding the most recently active row with it, and is
    recorded so the reviewer can see who lost it (R8).

    `junk` keys -- held by too many rows to identify anyone -- go to nobody, in
    any component: otherwise every account holding one collides with the next.
    """
    junk = set(junk)
    if component.should_merge:
        return AccountPlan(
            accounts=[build_unified_account(component, platform_admin_keys, None, junk)]
        )

    links = links or {}
    reviewed = any(r.key in links for r in component.rows)
    groups: Dict[str, List[LegacyRow]] = {}
    for row in rows_by_recency(component.rows):
        label = links.get(row.key) or f"unlinked {row.source_db}:{row.legacy_user_id}"
        groups.setdefault(label, []).append(row)
    group_of = {r.key: label for label, rows in groups.items() for r in rows}

    # A key only one account's rows hold is not contested, however many rows.
    contested = [
        w
        for w in _contested(component.rows)
        if w.value not in junk and len({group_of[k] for k in w.held_by}) > 1
    ]
    accounts = []
    for rows in groups.values():
        keys = {r.key for r in rows}
        lost = {w.value for w in contested if w.kept_by not in keys}
        accounts.append(
            build_unified_account(
                Component(rows=rows, edges=[], flags=component.flags),
                platform_admin_keys,
                merge_group_id=merge_group_id,
                withheld=junk | lost,
                merge_state="reviewed" if reviewed else None,
            )
        )
    return AccountPlan(
        accounts=accounts,
        withheld=contested,
        flags=component.flags,
        reviewed=reviewed,
    )


def load_links(path) -> Dict[Tuple[str, str], str]:
    """A reviewer's decisions: which rows of a flagged group are one person.

    Any CSV with source_db, legacy_user_id and link columns -- merge_review.csv
    with its link column filled in is one. Rows of one group given the same
    link become one account; a row left blank stays on its own.
    """
    with open(path, newline="") as fh:
        reader = csv.DictReader(fh)
        missing = {"source_db", "legacy_user_id", "link"} - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{path}: no {', '.join(sorted(missing))} column")
        # Stripped: a spreadsheet round trip adds spaces. A mangled id is
        # caught by unknown_links rather than silently skipped.
        return {
            (r["source_db"].strip(), r["legacy_user_id"].strip()): r["link"].strip()
            for r in reader
            if (r.get("link") or "").strip()
        }


def unknown_links(
    components: Iterable[Component], links: Dict[Tuple[str, str], str]
) -> List[Tuple[str, str]]:
    """Linked rows the sources no longer hold.

    Decisions made on a dry run are applied at cutover. A row deleted in
    between is reported rather than skipped: the decision it belonged to may
    no longer mean what the reviewer meant.
    """
    present = {r.key for c in components for r in c.rows}
    return sorted(key for key in links if key not in present)


def copies_without_activity(
    rows: Sequence[LegacyRow],
    copy_of: Dict[str, str],
    played: Set[Tuple[str, str]],
) -> Set[Tuple[str, str]]:
    """Rows that exist only because their database was seeded from another.

    `copy_of` maps a database to the one it was seeded from, as declared by the
    operator: world_tower started as a copy of walle_fantasy's users, so 102
    people appear in both under the same _id, and 98 of them never used World
    Towers. A copy earns its tournament a place on the profile only if that
    person built a team there, or signed in there after they last signed in to
    the original (decided for R23). Every row is still mapped either way.
    """
    by_key = {r.key: r for r in rows}
    idle = set()
    for r in rows:
        original_db = copy_of.get(r.source_db)
        if original_db is None:
            continue
        original = by_key.get((original_db, r.legacy_user_id))
        if original is None:
            continue
        if r.key in played:
            continue
        if r.last_login and (
            original.last_login is None or r.last_login > original.last_login
        ):
            continue
        idle.add(r.key)
    return idle


def point_copied_avatars_at_originals(
    accounts: Iterable[UnifiedAccount],
    rows: Sequence[LegacyRow],
    copy_of: Dict[str, str],
) -> int:
    """Read an avatar a copy inherited from the original's bucket.

    Seeding a database from another copied its users' avatar_file_id but not
    the files, so world_tower's users point at images only walle_fantasy's
    avatars bucket holds. Planned from the copy, phase 4 finds nothing there
    and clears an avatar that exists (R39). Returns how many plans moved.
    """
    by_key = {r.key: r for r in rows}
    moved = 0
    for account in accounts:
        original_db = copy_of.get(account.avatar_source_db)
        if original_db is None:
            continue
        for row in account.source_rows:
            if (
                row.source_db != account.avatar_source_db
                or row.avatar_file_id != account.avatar_file_id
            ):
                continue
            original = by_key.get((original_db, row.legacy_user_id))
            if original and original.avatar_file_id == account.avatar_file_id:
                account.avatar_source_db = original_db
                moved += 1
            break
    return moved


def undeclared_copies(
    rows: Sequence[LegacyRow], copy_of: Dict[str, str]
) -> Dict[Tuple[str, str], int]:
    """Pairs of databases sharing user _ids with no --copy-of saying which came first.

    A shared _id means one database was seeded from the other. Which one is the
    original decides who gets a membership, so it is declared rather than
    guessed -- the two first signups in the live case are six hours apart.
    """
    dbs_by_id: Dict[str, Set[str]] = defaultdict(set)
    for r in rows:
        dbs_by_id[r.legacy_user_id].add(r.source_db)

    shared: Dict[Tuple[str, str], int] = defaultdict(int)
    for dbs in dbs_by_id.values():
        ordered = sorted(dbs)
        for i, a in enumerate(ordered):
            for b in ordered[i + 1 :]:
                if copy_of.get(a) != b and copy_of.get(b) != a:
                    shared[(a, b)] += 1
    return dict(shared)


def plan_memberships(
    account: UnifiedAccount,
    slug_by_db: Dict[str, str],
    without_membership: Set[Tuple[str, str]] = frozenset(),
) -> List[MembershipPlan]:
    """One membership per tournament the person played in.

    Per tournament, not per row: two rows from one database can merge -- the
    same phone stored as 9876543210 and 919876543210, or one email registered
    twice through a racing signup -- and two memberships for one tournament
    would break uniq_user_per_tournament (R9). Every row stays in user_id_map.

    Role is per tournament: a legacy `is_admin` on any row makes that person an
    admin of the tournament they administered, and of nothing else.
    """
    by_db: Dict[str, List[LegacyRow]] = defaultdict(list)
    for row in account.source_rows:  # already most recent first
        if row.source_db in slug_by_db and row.key not in without_membership:
            by_db[row.source_db].append(row)

    plans = []
    for db, rows in by_db.items():
        lead = rows[0]
        created = [r.created_at for r in rows if r.created_at]
        logins = [r.last_login for r in rows if r.last_login]
        plans.append(
            MembershipPlan(
                tournament_slug=slug_by_db[db],
                source_db=db,
                legacy_user_id=lead.legacy_user_id,
                display_name=lead.username,
                role="admin" if any(r.is_admin for r in rows) else "player",
                joined_at=min(created) if created else None,
                last_login_at=max(logins) if logins else None,
            )
        )
    return plans
