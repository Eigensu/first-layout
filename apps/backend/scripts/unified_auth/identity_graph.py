"""Deciding which legacy accounts belong to the same person.

Accounts are joined when they share a mobile or an email, and each connected
component becomes one unified account. That is the whole idea, and the whole
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
# as spelling variants.
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
    full_name: Optional[str] = None
    is_admin: bool = False
    is_active: bool = True
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
    via: str  # "mobile" | "email"
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


def _names_agree(a: LegacyRow, b: LegacyRow) -> Optional[bool]:
    """True/False when both have a name, None when at least one does not."""
    na, nb = normalise_name(a.full_name), normalise_name(b.full_name)
    if not na or not nb:
        return None
    if na == nb:
        return True
    return SequenceMatcher(None, na, nb).ratio() >= NAME_SIMILARITY_THRESHOLD


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

    if len(component_rows) > 2:
        # Three or more accounts joined transitively: A shares a number with B,
        # B shares an address with C, and nothing links A to C at all.
        flags.append("chained")

    google_ids = {r.google_id for r in component_rows if r.google_id}
    if len(google_ids) > 1:
        flags.append("multi_google")

    # Which pairs are corroborated by more than one channel.
    channels: Dict[frozenset, Set[str]] = defaultdict(set)
    for edge in component_edges:
        channels[frozenset((edge.a, edge.b))].add(edge.via)

    for pair, vias in channels.items():
        a, b = (by_key[k] for k in pair)
        agree = _names_agree(a, b)

        if agree is False:
            if "mobile" in vias:
                flags.append("shared_mobile_diff_names")
            else:
                flags.append("name_mismatch")
            continue

        # A mobile edge on its own, across activity windows that never came
        # near each other, is as consistent with a reallocated number as with
        # one person returning next season. Corroboration settles it: a second
        # channel agreeing, or matching names, and the gap stops mattering.
        corroborated = len(vias) > 1 or agree is True
        if not corroborated and vias == {"mobile"}:
            if _windows_are_disjoint_by(a, b, recycle_gap):
                flags.append("possible_recycled_mobile")

    return sorted(set(flags))


def build_components(
    rows: Sequence[LegacyRow], recycle_gap: timedelta = RECYCLE_GAP
) -> Tuple[List[Component], Set[str]]:
    """Group legacy rows into one component per person, flagging the doubtful.

    Returns the components and the set of keys discarded as junk.
    """
    uf = _UnionFind()
    for row in rows:
        uf.add(row.key)

    by_mobile, by_email, junk = _index_by_key(rows)

    edges: List[Edge] = []
    for via, bucket in (("mobile", by_mobile), ("email", by_email)):
        for value, holders in bucket.items():
            for other in holders[1:]:
                uf.union(holders[0].key, other.key)
            # Every pair in the bucket shares this key, and the flagging needs
            # the pairwise view rather than the star.
            for i, a in enumerate(holders):
                for b in holders[i + 1 :]:
                    edges.append(Edge(a=a.key, b=b.key, via=via, value=value))

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
