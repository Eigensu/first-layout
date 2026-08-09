"use client";

import React, { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { POOL_SORTS, type PoolSort } from "@/components/team/PlayerCard/types";
import { playerValueLabel } from "@/utils/playerValue";
import type { ContestFormat } from "@/common/consts/contest";
import {
  ALL_TEAMS,
  POOL_STATUS,
  type PoolStatus,
  type PriceBucket,
} from "./usePlayerPoolFilters";

export interface PoolFilterBarProps {
  query: string;
  onQueryChange: (v: string) => void;

  status: PoolStatus;
  onStatusChange: (v: PoolStatus) => void;
  counts: { all: number; inSquad: number; available: number };

  teamFilter: string;
  onTeamFilterChange: (v: string) => void;
  teamOptions: string[];

  sort: PoolSort;
  onSortChange: (v: PoolSort) => void;

  priceBuckets: PriceBucket[];
  priceBucketIndex: number | null;
  onPriceBucketChange: (v: number | null) => void;

  contestFormat?: ContestFormat;
  /** Hides the status chips where every row is selectable anyway (Replace). */
  showStatusChips?: boolean;
  hasActiveFilters?: boolean;
  onReset?: () => void;
}

const chipBase =
  "flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-all duration-150 whitespace-nowrap active:scale-95";
const chipOn = "bg-primary-600 border-primary-600 text-white shadow-sm";
const chipOff =
  "bg-white/[0.04] border-white/[0.10] text-text-muted hover:text-text-main hover:border-white/20";

/**
 * Search, squad-status, team, price and sort controls shared by both edit
 * surfaces so they behave identically.
 *
 * The secondary controls collapse behind a toggle: on a phone the sheet has
 * little vertical room, and pushing the player list below a permanent filter
 * stack is what made the old modal awkward to use one-handed.
 */
export function PoolFilterBar({
  query,
  onQueryChange,
  status,
  onStatusChange,
  counts,
  teamFilter,
  onTeamFilterChange,
  teamOptions,
  sort,
  onSortChange,
  priceBuckets,
  priceBucketIndex,
  onPriceBucketChange,
  contestFormat,
  showStatusChips = true,
  hasActiveFilters = false,
  onReset,
}: PoolFilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const valueLabel = playerValueLabel(contestFormat);

  return (
    <div className="space-y-2">
      {/* Search + filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search player or team..."
            // 16px minimum, otherwise iOS Safari zooms the page on focus.
            className="w-full pl-9 pr-9 py-2.5 text-base sm:text-sm bg-white/[0.04] border border-white/[0.10] rounded-xl text-text-main placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
            aria-label="Search players"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-text-muted hover:text-text-main"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={`shrink-0 w-11 rounded-xl flex items-center justify-center border transition-colors ${
            expanded || priceBucketIndex !== null || teamFilter !== ALL_TEAMS
              ? "bg-primary-600 border-primary-600 text-white"
              : "bg-white/[0.04] border-white/[0.10] text-text-muted"
          }`}
          aria-label="Filters"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Squad status */}
      {showStatusChips && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {(
            [
              [POOL_STATUS.ALL, "All", counts.all],
              [POOL_STATUS.IN_SQUAD, "In squad", counts.inSquad],
              [POOL_STATUS.AVAILABLE, "Available", counts.available],
            ] as const
          ).map(([value, label, n]) => (
            <button
              key={value}
              type="button"
              onClick={() => onStatusChange(value)}
              className={`${chipBase} ${status === value ? chipOn : chipOff}`}
              aria-pressed={status === value}
            >
              {label} ({n})
            </button>
          ))}
        </div>
      )}

      {/* Secondary filters */}
      {expanded && (
        <div className="space-y-2 pt-0.5">
          <div className="flex gap-2">
            <label className="flex-1 min-w-0">
              <span className="sr-only">Filter by team</span>
              <select
                value={teamFilter}
                onChange={(e) => onTeamFilterChange(e.target.value)}
                className="w-full rounded-xl border border-white/[0.10] bg-bg-card text-text-main px-2.5 py-2 text-xs"
              >
                <option value={ALL_TEAMS}>All teams</option>
                {teamOptions.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 min-w-0">
              <span className="sr-only">Sort players</span>
              <select
                value={sort}
                onChange={(e) => onSortChange(e.target.value as PoolSort)}
                className="w-full rounded-xl border border-white/[0.10] bg-bg-card text-text-main px-2.5 py-2 text-xs"
              >
                <option value={POOL_SORTS.VALUE_DESC}>
                  {valueLabel}: high to low
                </option>
                <option value={POOL_SORTS.VALUE_ASC}>
                  {valueLabel}: low to high
                </option>
                <option value={POOL_SORTS.POINTS_DESC}>Fantasy points</option>
                <option value={POOL_SORTS.NAME_ASC}>Name (A–Z)</option>
              </select>
            </label>
          </div>

          {priceBuckets.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {priceBuckets.map((bucket, idx) => (
                <button
                  key={bucket.label}
                  type="button"
                  onClick={() =>
                    onPriceBucketChange(priceBucketIndex === idx ? null : idx)
                  }
                  className={`${chipBase} ${
                    priceBucketIndex === idx ? chipOn : chipOff
                  }`}
                  aria-pressed={priceBucketIndex === idx}
                >
                  {bucket.label}
                </button>
              ))}
            </div>
          )}

          {hasActiveFilters && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-text-muted underline hover:text-text-main"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
