"use client";

import { useMemo, useState } from "react";
import { POOL_SORTS, type PoolSort } from "@/components/team/PlayerCard/types";
import {
  PRICE_RANGES,
  type PriceRange,
} from "@/components/team/PlayerCard/priceRanges";

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

export type PriceBucket = PriceRange;

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

  const priceBuckets = PRICE_RANGES;

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
