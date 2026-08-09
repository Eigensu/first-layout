"use client";

import React from "react";
import { formatPoints } from "@/utils/playerValue";

export interface SquadValueBarProps {
  /** Sum of the squad's auction prices. */
  spent: number;
  /** The contest's purse. 0 or undefined hides the ratio and the bar fill. */
  purse?: number;
  className?: string;
}

/**
 * What an already-built auction squad cost, shown above the squad list.
 *
 * The team builder's PurseBar answers "what can I still afford?"; this answers
 * "what did this squad cost?", so it leads with spend rather than remaining.
 * Overspend is still coloured because an admin price edit after the fact can
 * push a saved squad past the purse it was built against.
 */
export function SquadValueBar({ spent, purse, className }: SquadValueBarProps) {
  const hasPurse = typeof purse === "number" && purse > 0;
  const pctSpent = hasPurse ? Math.min(100, (spent / purse!) * 100) : 0;
  const overspent = hasPurse && spent > purse!;

  return (
    <div
      className={`rounded-lg border border-border-subtle bg-bg-elevated p-2.5 sm:p-3 space-y-1.5 mb-4 ${
        className || ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] sm:text-xs text-text-muted uppercase tracking-wide">
          Squad value
        </span>
        <span
          className={`text-sm sm:text-lg font-bold tabular-nums ${
            overspent ? "text-danger" : "text-text-main"
          }`}
        >
          {formatPoints(spent)}
        </span>
      </div>

      {hasPurse && (
        <>
          <div
            className="h-1.5 sm:h-2 w-full rounded-full bg-bg-card overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={purse}
            aria-valuenow={Math.max(0, spent)}
            aria-label="Squad value against purse"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                overspent ? "bg-danger" : "bg-gradient-brand"
              }`}
              style={{ width: `${pctSpent}%` }}
            />
          </div>

          <div className="text-[10px] sm:text-xs text-text-muted tabular-nums">
            Spent {formatPoints(spent)} of {formatPoints(purse!)}
          </div>
        </>
      )}
    </div>
  );
}
