"use client";

import React from "react";
import { formatPoints } from "@/utils/playerValue";

export interface EditPurseBarProps {
  purse: number;
  spent: number;
  selectedCount: number;
  squadSize: number;
}

/**
 * Budget readout while editing an auction squad.
 *
 * Leads with what is left rather than what a squad cost (the team card's
 * SquadValueBar does that), because every decision in this sheet is "can I
 * still afford the swap I am about to make?".
 *
 * Deliberately one line plus a meter. It sits above the player list in a bottom
 * sheet, so every row it occupies is a row of players the user cannot see. The
 * per-team counters that used to sit here are gone: the cap is still enforced,
 * and a player who would break it says so on their own row, where the user is
 * actually looking when it matters.
 */
export function EditPurseBar({
  purse,
  spent,
  selectedCount,
  squadSize,
}: EditPurseBarProps) {
  const remaining = purse - spent;
  const pctSpent = purse > 0 ? Math.min(100, (spent / purse) * 100) : 0;
  const overspent = remaining < 0;
  const placesLeft = Math.max(0, squadSize - selectedCount);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-text-muted">
          Purse left{" "}
          <span
            className={`text-sm font-bold tabular-nums ${
              overspent ? "text-danger" : "text-success"
            }`}
          >
            {formatPoints(remaining)}
          </span>
          <span className="tabular-nums"> of {formatPoints(purse)}</span>
        </span>
        <span className="text-[11px] text-text-muted tabular-nums">
          {placesLeft} place{placesLeft === 1 ? "" : "s"} left
        </span>
      </div>

      <div
        className="h-1 w-full rounded-full bg-white/[0.08] overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={purse}
        aria-valuenow={Math.max(0, spent)}
        aria-valuetext={`Spent ${formatPoints(spent)} of ${formatPoints(purse)}`}
        aria-label="Purse spent"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            overspent ? "bg-danger" : "bg-gradient-brand"
          }`}
          style={{ width: `${pctSpent}%` }}
        />
      </div>
    </div>
  );
}
