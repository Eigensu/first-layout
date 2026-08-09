import React from "react";
import { formatPoints } from "@/utils/playerValue";

interface PurseBarProps {
  purse: number;
  spent: number;
  remaining: number;
  selectedCount: number;
  squadSize: number;
  /** How many players are taken from each real-world team so far */
  countByTeam?: Record<string, number>;
  /** Per-team cap; 0 or undefined hides the team counters */
  maxPerTeam?: number;
}

/**
 * Budget readout for auction contests: how much of the purse is committed and
 * how much is left to spend on the remaining squad places.
 */
export const PurseBar: React.FC<PurseBarProps> = ({
  purse,
  spent,
  remaining,
  selectedCount,
  squadSize,
  countByTeam = {},
  maxPerTeam = 0,
}) => {
  const pctSpent = purse > 0 ? Math.min(100, (spent / purse) * 100) : 0;
  const overspent = remaining < 0;
  const placesLeft = Math.max(0, squadSize - selectedCount);

  // Only teams the user has actually drawn from, fullest first.
  const teamCounts = Object.entries(countByTeam)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-card p-2 sm:p-3 space-y-1.5 sm:space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] sm:text-xs text-text-muted uppercase tracking-wide">
          Purse remaining
        </span>
        <span
          className={`text-sm sm:text-lg font-bold tabular-nums ${
            overspent ? "text-red-500" : "text-emerald-500"
          }`}
        >
          {formatPoints(remaining)}
        </span>
      </div>

      <div
        className="h-1.5 sm:h-2 w-full rounded-full bg-bg-elevated overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={purse}
        aria-valuenow={Math.max(0, spent)}
        aria-label="Purse spent"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            overspent ? "bg-red-500" : "bg-gradient-brand"
          }`}
          style={{ width: `${pctSpent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] sm:text-xs text-text-muted tabular-nums">
        <span>
          Spent {formatPoints(spent)} of {formatPoints(purse)}
        </span>
        <span>
          {placesLeft} place{placesLeft === 1 ? "" : "s"} left
        </span>
      </div>

      {/* Per-team usage against the cap. A tooltip would not reach touch
          users, so the counts are shown outright. */}
      {maxPerTeam > 0 && teamCounts.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {teamCounts.map(([team, count]) => {
            const full = count >= maxPerTeam;
            return (
              <span
                key={team}
                className={`px-1.5 py-0.5 rounded-full text-[9px] sm:text-[11px] font-medium tabular-nums ${
                  full
                    ? "bg-amber-500/15 text-amber-500"
                    : "bg-bg-elevated text-text-muted"
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
};
