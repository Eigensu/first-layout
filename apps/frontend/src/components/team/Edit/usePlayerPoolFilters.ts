"use client";

import { useEffect, useMemo, useState } from "react";
import { POOL_SORTS, type PoolSort } from "@/components/team/PlayerCard/types";

export const ALL_TEAMS = "__all__";

/** Which side of the squad boundary a player is on. */
export const POOL_STATUS = {
  ALL: "all",
  IN_SQUAD: "in_squad",
  AVAILABLE: "available",
} as const;

export type PoolStatus = (typeof POOL_STATUS)[keyof typeof POOL_STATUS];

export interface PoolFilterablePlayer {
  id: string;
  name: string;
  team?: string;
  points?: number;
  price?: number;
}

export interface PriceBucket {
  label: string;
  min: number;
  max: number;
}

/**
 * Split the pool's own price span into buckets.
 *
 * The builder's PlayerList hardcodes rupee bands, which are meaningless for an
 * auction contest where `price` is a points figure scaled to the purse. Deriving
 * the bands from the players actually on offer keeps one filter honest for both
 * formats, and collapses to nothing when the pool has no prices at all.
 */
function derivePriceBuckets(prices: number[]): PriceBucket[] {
  const priced = prices.filter((p) => p > 0).sort((a, b) => a - b);
  if (priced.length < 4) return [];

  const min = priced[0];
  const max = priced[priced.length - 1];
  if (max <= min) return [];

  const fmt = (n: number) => Math.round(n).toLocaleString();
  const step = (max - min) / 4;
  const edges = [min, min + step, min + step * 2, min + step * 3, max];

  return [0, 1, 2, 3].map((i) => {
    // Top bucket owns the max so the highest-priced player is always matched.
    const lo = edges[i];
    const hi = i === 3 ? max : edges[i + 1];
    return {
      label: `${fmt(lo)} – ${fmt(hi)}`,
      min: lo,
      // Non-top buckets stop just below the next edge to avoid double-counting.
      max: i === 3 ? max : hi - 0.000001,
    };
  });
}

export interface PoolFilterResult<T> {
  query: string;
  setQuery: (v: string) => void;
  teamFilter: string;
  setTeamFilter: (v: string) => void;
  sort: PoolSort;
  setSort: (v: PoolSort) => void;
  priceBucketIndex: number | null;
  setPriceBucketIndex: (v: number | null) => void;
  status: PoolStatus;
  setStatus: (v: PoolStatus) => void;

  teamOptions: string[];
  priceBuckets: PriceBucket[];

  /** Passes every filter including status, in sort order. */
  filtered: T[];
  /** Filtered and sorted, split by squad membership. */
  inSquad: T[];
  available: T[];
  /**
   * How many players match everything EXCEPT the status filter. These drive the
   * status chips, so a search can always show where its matches went instead of
   * dead-ending on an empty list.
   */
  counts: { all: number; inSquad: number; available: number };
  hasActiveFilters: boolean;
  reset: () => void;
}

export function usePlayerPoolFilters<T extends PoolFilterablePlayer>(
  players: T[],
  selectedIds: string[],
): PoolFilterResult<T> {
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAMS);
  const [sort, setSort] = useState<PoolSort>(POOL_SORTS.VALUE_DESC);
  const [priceBucketIndex, setPriceBucketIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<PoolStatus>(POOL_STATUS.ALL);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const teamOptions = useMemo(() => {
    const names = new Set<string>();
    players.forEach((p) => {
      if (p.team) names.add(p.team);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [players]);

  const priceBuckets = useMemo(
    () => derivePriceBuckets(players.map((p) => p.price || 0)),
    [players],
  );

  // A bucket index can outlive the pool it was derived from (the modal reopens
  // against a different contest), so drop it rather than filter on a stale band.
  useEffect(() => {
    if (priceBucketIndex !== null && priceBucketIndex >= priceBuckets.length) {
      setPriceBucketIndex(null);
    }
  }, [priceBuckets, priceBucketIndex]);

  /** Everything except the status filter — the basis for the status counts. */
  const preStatus = useMemo(() => {
    let list = players.slice();

    if (teamFilter !== ALL_TEAMS) {
      list = list.filter((p) => p.team === teamFilter);
    }

    if (priceBucketIndex !== null && priceBuckets[priceBucketIndex]) {
      const { min, max } = priceBuckets[priceBucketIndex];
      list = list.filter((p) => {
        const price = p.price || 0;
        return price >= min && price <= max;
      });
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.team || "").toLowerCase().includes(q),
      );
    }

    const bySort: Record<PoolSort, (a: T, b: T) => number> = {
      [POOL_SORTS.VALUE_DESC]: (a, b) => (b.price || 0) - (a.price || 0),
      [POOL_SORTS.VALUE_ASC]: (a, b) => (a.price || 0) - (b.price || 0),
      [POOL_SORTS.POINTS_DESC]: (a, b) => (b.points || 0) - (a.points || 0),
      [POOL_SORTS.NAME_ASC]: (a, b) => a.name.localeCompare(b.name),
    };
    list.sort(bySort[sort]);

    return list;
  }, [players, teamFilter, priceBucketIndex, priceBuckets, query, sort]);

  const inSquad = useMemo(
    () => preStatus.filter((p) => selectedSet.has(p.id)),
    [preStatus, selectedSet],
  );
  const available = useMemo(
    () => preStatus.filter((p) => !selectedSet.has(p.id)),
    [preStatus, selectedSet],
  );

  const filtered = useMemo(() => {
    if (status === POOL_STATUS.IN_SQUAD) return inSquad;
    if (status === POOL_STATUS.AVAILABLE) return available;
    return preStatus;
  }, [status, preStatus, inSquad, available]);

  const hasActiveFilters =
    query.trim() !== "" ||
    teamFilter !== ALL_TEAMS ||
    priceBucketIndex !== null ||
    status !== POOL_STATUS.ALL;

  const reset = () => {
    setQuery("");
    setTeamFilter(ALL_TEAMS);
    setPriceBucketIndex(null);
    setStatus(POOL_STATUS.ALL);
  };

  return {
    query,
    setQuery,
    teamFilter,
    setTeamFilter,
    sort,
    setSort,
    priceBucketIndex,
    setPriceBucketIndex,
    status,
    setStatus,
    teamOptions,
    priceBuckets,
    filtered,
    inSquad,
    available,
    counts: {
      all: preStatus.length,
      inSquad: inSquad.length,
      available: available.length,
    },
    hasActiveFilters,
    reset,
  };
}
