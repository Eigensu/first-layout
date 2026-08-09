"use client";

import React from "react";
import { formatPoints } from "@/utils/playerValue";

export interface EditPurseBarProps {
  purse: number;
  spent: number;
  selectedCount: number;
  squadSize: number;
  /** Players taken from each real-world team so far. */
  countByTeam?: Record<string, number>;
  /** Per-team cap; 0 hides the counters. */
  maxPerTeam?: number;
}

/**
 * Budget readout while editing an auction squad.
 *
 * Leads with what is left rather than what a squad cost (the team card's
 * SquadValueBar does that), because every decision in this sheet is "can I
 * still afford the swap I am about to make?".
 */
export function EditPurseBar({
  purse,
  spent,
  selectedCount,
  squadSize,
  countByTeam = {},
  maxPerTeam = 0,
}: EditPurseBarProps) {
  const remaining = purse - spent;
  const pctSpent = purse > 0 ? Math.min(100, (spent / purse) * 100) : 0;
  const overspent = remaining < 0;
  const placesLeft = Math.max(0, squadSize - selectedCount);

  const teamCounts = Object.entries(countByTeam)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-text-muted">
          Purse remaining
        </span>
        <span
          className={`text-base font-bold tabular-nums ${
            overspent ? "text-danger" : "text-success"
          }`}
        >
          {formatPoints(remaining)}
        </span>
      </div>

      <div
        className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={purse}
        aria-valuenow={Math.max(0, spent)}
        aria-label="Purse spent"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            overspent ? "bg-danger" : "bg-gradient-brand"
          }`}
          style={{ width: `${pctSpent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-text-muted tabular-nums">
        <span>
          Spent {formatPoints(spent)} of {formatPoints(purse)}
        </span>
        <span>
          {placesLeft} place{placesLeft === 1 ? "" : "s"} left
        </span>
      </div>

      {maxPerTeam > 0 && teamCounts.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {teamCounts.map(([team, count]) => {
            const full = count >= maxPerTeam;
            return (
              <span
                key={team}
                className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium tabular-nums ${
                  full
                    ? "bg-warning/15 text-warning"
                    : "bg-white/[0.06] text-text-muted"
                }`}
              >
                {team} {count}/{maxPerTeam}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
