"""Deciding which legacy accounts belong to the same person.

Accounts are joined when they share a mobile, an email, or the Google or Apple
account they signed in with, or when one was copied from the other into a
database seeded from another's users. Each connected component becomes one
unified account. That is the whole idea, and the whole
risk: every edge is a claim that two logins are one human, and a wrong claim
hands someone a stranger's account.

So the output is not a merge. It is a *plan*, split into components that are
safe to merge automatically and components that are not. Anything flagged
migrates as separate accounts and waits for a person to rule on it, because
splitting two accounts that should have merged is an inconvenience while
merging two that should not is a breach.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from .normalise import (
    MAX_ROWS_PER_KEY,
    normalise_email,
    normalise_mobile,
    normalise_name,
)

# Below this, two full_name values are treated as different people rather than
# as spelling variants, and the pair is flagged. At or above it they are not
# called different -- but on a mobile-only edge that is still not enough to
# merge; there only an exact match is (see _flag_component).
NAME_SIMILARITY_THRESHOLD = 0.80

# A mobile edge whose two accounts were never active within this of each other
# is treated as possibly a recycled number rather than one person returning.
#
# Twelve months rather than the ~180 days after which reallocation becomes
# physically possible, because this product is seasonal: the same person's two
# tournaments are routinely ten to fourteen months apart, and a shorter cut
# would flag mostly ordinary returning players. Tune it from the histogram the
# plan emits rather than from this comment.
RECYCLE_GAP = timedelta(days=365)


@dataclass(frozen=True)
class LegacyRow:
    """One user document from one pre-unification database."""

    source_db: str
    legacy_user_id: str
    username: str
    email: Optional[str] = None
    mobile: Optional[str] = None
    google_id: Optional[str] = None
    apple_id: Optional[str] = None
    full_name: Optional[str] = None
    is_admin: bool = False
    is_active: bool = True
    # Not used to decide who is who -- only to build the account afterwards.
    hashed_password: Optional[str] = None
    is_verified: bool = False
    avatar_file_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None

    @property
    def key(self) -> Tuple[str, str]:
        return (self.source_db, self.legacy_user_id)

    @property
    def active_from(self) -> Optional[datetime]:
        return self.created_at

    @property
    def active_until(self) -> Optional[datetime]:
        stamps = [d for d in (self.last_login, self.updated_at, self.created_at) if d]
        return max(stamps) if stamps else None


@dataclass
class Edge:
    a: Tuple[str, str]
    b: Tuple[str, str]
    via: str  # "mobile" | "email" | "google" | "apple" | "copy"
    value: str


@dataclass
class Component:
    rows: List[LegacyRow]
    edges: List[Edge]
    flags: List[str] = field(default_factory=list)

    @property
    def size(self) -> int:
        return len(self.rows)

    @property
    def should_merge(self) -> bool:
        return not self.flags


class _UnionFind:
    def __init__(self) -> None:
        self._parent: Dict[Tuple[str, str], Tuple[str, str]] = {}

    def add(self, item: Tuple[str, str]) -> None:
        self._parent.setdefault(item, item)

    def find(self, item: Tuple[str, str]) -> Tuple[str, str]:
        root = item
        while self._parent[root] != root:
            root = self._parent[root]
        while self._parent[item] != root:  # path compression
            self._parent[item], item = root, self._parent[item]
        return root

    def union(self, a: Tuple[str, str], b: Tuple[str, str]) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self._parent[rb] = ra


def _index_by_key(
    rows: Sequence[LegacyRow],
) -> Tuple[Dict[str, List[LegacyRow]], Dict[str, List[LegacyRow]], Set[str]]:
    """Group rows by normalised mobile and email, dropping over-shared keys."""
    by_mobile: Dict[str, List[LegacyRow]] = defaultdict(list)
    by_email: Dict[str, List[LegacyRow]] = defaultdict(list)

    for row in rows:
        mobile = normalise_mobile(row.mobile)
        if mobile:
            by_mobile[mobile].append(row)
        email = normalise_email(row.email)
        if email:
            by_email[email].append(row)

    junk: Set[str] = set()
    for bucket in (by_mobile, by_email):
        for value, holders in list(bucket.items()):
            if len(holders) > MAX_ROWS_PER_KEY:
                junk.add(value)
                del bucket[value]

    return by_mobile, by_email, junk


def _index_by_sign_in(
    rows: Sequence[LegacyRow],
) -> Dict[str, Dict[str, List[LegacyRow]]]:
    """Group rows by the Google or Apple account they signed in with.

    A provider id is proof of one login, stronger than a shared address: Google
    and Apple say who signed in. Two accounts with the same one are the same
    person, and could not both keep it anyway -- uniq_google_ids and
    uniq_apple_ids allow one account each.

    No MAX_ROWS_PER_KEY cap. That cap exists because a phone or an address can
    be shared by strangers; a provider id cannot. Someone who signed in with
    Google in five tournaments has five rows with one id, and capping it would
    both split them and take Google sign-in away from all five.
    """
    buckets: Dict[str, Dict[str, List[LegacyRow]]] = {
        "google": defaultdict(list),
        "apple": defaultdict(list),
    }
    for row in rows:
        if row.google_id:
            buckets["google"][row.google_id].append(row)
        if row.apple_id:
            buckets["apple"][row.apple_id].append(row)
    return buckets


def _copies(
    rows: Sequence[LegacyRow], copy_of: Dict[str, str]
) -> List[Tuple[LegacyRow, LegacyRow]]:
    """Each row of a declared copy paired with the row it was copied from.

    A database seeded from another holds its users under the same _id, so the
    pair is one account copied, not two that happen to look alike. Without
    this edge they join only through a phone or address, and someone whose
    keys are all junk becomes two accounts (R41).
    """
    by_key = {r.key: r for r in rows}
    return [
        (by_key[(copy_of[r.source_db], r.legacy_user_id)], r)
        for r in rows
        if r.source_db in copy_of and (copy_of[r.source_db], r.legacy_user_id) in by_key
    ]


def _names_agree(a: LegacyRow, b: LegacyRow) -> Optional[bool]:
    """True/False when both have a name, None when at least one does not."""
    na, nb = normalise_name(a.full_name), normalise_name(b.full_name)
    if not na or not nb:
        return None
    if na == nb:
        return True
    return SequenceMatcher(None, na, nb).ratio() >= NAME_SIMILARITY_THRESHOLD


def _names_match_exactly(a: LegacyRow, b: LegacyRow) -> bool:
    """Both have a name, and they are identical once normalised."""
    na, nb = normalise_name(a.full_name), normalise_name(b.full_name)
    return bool(na) and na == nb


def _windows_are_disjoint_by(a: LegacyRow, b: LegacyRow, gap: timedelta) -> bool:
    """True when the two accounts were never active anywhere near each other."""
    if not (a.active_from and a.active_until and b.active_from and b.active_until):
        return False  # unknown is not evidence of anything
    earlier, later = (a, b) if a.active_until <= b.active_until else (b, a)
    if later.active_from <= earlier.active_until:
        return False  # they overlap
    return (later.active_from - earlier.active_until) > gap


def gap_between(a: LegacyRow, b: LegacyRow) -> Optional[timedelta]:
    """Time between one account going quiet and the other starting up."""
    if not (a.active_from and a.active_until and b.active_from and b.active_until):
        return None
    earlier, later = (a, b) if a.active_until <= b.active_until else (b, a)
    if later.active_from <= earlier.active_until:
        return timedelta(0)
    return later.active_from - earlier.active_until


def _flag_component(
    component_rows: List[LegacyRow],
    component_edges: List[Edge],
    recycle_gap: timedelta,
) -> List[str]:
    flags: List[str] = []
    if len(component_rows) < 2:
        return flags

    by_key = {r.key: r for r in component_rows}

    # Which pairs are corroborated by more than one channel.
    channels: Dict[frozenset, Set[str]] = defaultdict(set)
    for edge in component_edges:
        channels[frozenset((edge.a, edge.b))].add(edge.via)

    keys = [r.key for r in component_rows]
    every_pair = {frozenset((a, b)) for i, a in enumerate(keys) for b in keys[i + 1 :]}
    if not every_pair <= set(channels):
        # Joined transitively: A shares a number with B, B shares an address
        # with C, and nothing links A to C at all. Size alone is not this --
        # someone who played three tournaments on one phone is three directly
        # linked accounts, and holding those back would split exactly the
        # players the unified profile is for.
        flags.append("chained")

    google_ids = {r.google_id for r in component_rows if r.google_id}
    if len(google_ids) > 1:
        flags.append("multi_google")

    for pair, vias in channels.items():
        a, b = (by_key[k] for k in pair)
        agree = _names_agree(a, b)

        if agree is False:
            if "mobile" in vias:
                flags.append("shared_mobile_diff_names")
            else:
                flags.append("name_mismatch")
            continue

        # A mobile on its own is the weakest edge there is: numbers get
        # reallocated, and families share one. So with no second channel
        # agreeing, only an exactly matching name lets it merge -- a fuzzy
        # match is too easy for two different people with a common name to
        # pass (spec §13.2, R3).
        if vias == {"mobile"}:
            if not _names_match_exactly(a, b):
                flags.append("mobile_only_name_unconfirmed")
            # Even with matching names, activity windows that never came near
            # each other are as consistent with a reallocated number as with
            # one person returning next season.
            if _windows_are_disjoint_by(a, b, recycle_gap):
                flags.append("possible_recycled_mobile")

    return sorted(set(flags))


def build_components(
    rows: Sequence[LegacyRow],
    recycle_gap: timedelta = RECYCLE_GAP,
    copy_of: Optional[Dict[str, str]] = None,
) -> Tuple[List[Component], Set[str]]:
    """Group legacy rows into one component per person, flagging the doubtful.

    `copy_of` maps a database to the one it was seeded from (--copy-of); each
    copied row is joined to its original. Returns the components and the set
    of keys discarded as junk.
    """
    uf = _UnionFind()
    for row in rows:
        uf.add(row.key)

    by_mobile, by_email, junk = _index_by_key(rows)
    by_provider = _index_by_sign_in(rows)

    edges: List[Edge] = []
    for via, bucket in (
        ("mobile", by_mobile),
        ("email", by_email),
        *by_provider.items(),
    ):
        for value, holders in bucket.items():
            for other in holders[1:]:
                uf.union(holders[0].key, other.key)
            # Every pair in the bucket shares this key, and the flagging needs
            # the pairwise view rather than the star.
            for i, a in enumerate(holders):
                for b in holders[i + 1 :]:
                    edges.append(Edge(a=a.key, b=b.key, via=via, value=value))

    for original, copy in _copies(rows, copy_of or {}):
        uf.union(original.key, copy.key)
        edges.append(
            Edge(a=original.key, b=copy.key, via="copy", value=copy.legacy_user_id)
        )

    grouped_rows: Dict[Tuple[str, str], List[LegacyRow]] = defaultdict(list)
    for row in rows:
        grouped_rows[uf.find(row.key)].append(row)

    grouped_edges: Dict[Tuple[str, str], List[Edge]] = defaultdict(list)
    for edge in edges:
        grouped_edges[uf.find(edge.a)].append(edge)

    components = []
    for root, component_rows in grouped_rows.items():
        component_edges = grouped_edges.get(root, [])
        components.append(
            Component(
                rows=sorted(component_rows, key=lambda r: r.key),
                edges=component_edges,
                flags=_flag_component(component_rows, component_edges, recycle_gap),
            )
        )

    components.sort(key=lambda c: (-c.size, c.rows[0].key))
    return components, junk


def rows_holding_junk(
    rows: Sequence[LegacyRow], junk: Set[str]
) -> Dict[str, List[LegacyRow]]:
    """Each discarded key and the rows that hold it.

    Rows split apart by a junk key are singletons, so they never appear in the
    review queue. This is how a reviewer finds them -- most are strangers on a
    shared office number, but a regular of four or more tournaments looks the
    same, and only a person can tell them apart.
    """
    holding: Dict[str, List[LegacyRow]] = defaultdict(list)
    for row in rows:
        for key in (normalise_mobile(row.mobile), normalise_email(row.email)):
            if key in junk:
                holding[key].append(row)
    return dict(holding)


def gap_histogram(
    components: Iterable[Component],
    buckets_days: Sequence[int] = (0, 30, 90, 180, 365, 730),
) -> Dict[str, int]:
    """How far apart shared-mobile pairs were active.

    The point of emitting this is that ``RECYCLE_GAP`` should be chosen from
    the real distribution rather than from a guess. If the counts fall away
    smoothly there is no natural cut and the threshold is arbitrary; if they
    are bimodal, the trough between the humps is where it belongs.
    """
    labels = [f"<{d}d" for d in buckets_days[1:]] + [f">={buckets_days[-1]}d"]
    histogram = {label: 0 for label in labels}

    for component in components:
        seen: Set[frozenset] = set()
        for edge in component.edges:
            if edge.via != "mobile":
                continue
            pair = frozenset((edge.a, edge.b))
            if pair in seen:
                continue
            seen.add(pair)
            by_key = {r.key: r for r in component.rows}
            gap = gap_between(by_key[edge.a], by_key[edge.b])
            if gap is None:
                continue
            days = gap.days
            for upper, label in zip(buckets_days[1:], labels):
                if days < upper:
                    histogram[label] += 1
                    break
            else:
                histogram[labels[-1]] += 1

    return histogram


def summarise(components: Sequence[Component], junk: Set[str]) -> Dict[str, object]:
    """The numbers a person needs before agreeing to run the merge."""
    mergeable = [c for c in components if c.should_merge and c.size > 1]
    flagged = [c for c in components if c.flags]

    flag_counts: Dict[str, int] = defaultdict(int)
    for component in flagged:
        for flag in component.flags:
            flag_counts[flag] += 1

    return {
        "legacy_rows": sum(c.size for c in components),
        "components": len(components),
        "singletons": len([c for c in components if c.size == 1]),
        "auto_merge_components": len(mergeable),
        "accounts_absorbed_by_merges": sum(c.size - 1 for c in mergeable),
        "flagged_components": len(flagged),
        "flag_counts": dict(sorted(flag_counts.items())),
        "junk_keys_discarded": len(junk),
        "gap_histogram_days": gap_histogram(components),
    }
