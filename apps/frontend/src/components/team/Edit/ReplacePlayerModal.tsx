"use client";

import React, { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { PlayerListItem, type EditPlayer } from "./PlayerListItem";
import { PoolFilterBar } from "./PoolFilterBar";
import { usePlayerPoolFilters } from "./usePlayerPoolFilters";
import { CONTEST_FORMAT, type ContestFormat } from "@/common/consts/contest";
import { formatPlayerValue, formatPoints } from "@/utils/playerValue";

interface ReplacePlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPlayerId?: string;
  players: EditPlayer[];
  /**
   * The squad being edited. Its members are never offered as replacements —
   * picking one would map two slots onto the same id and duplicate the player.
   */
  currentPlayerIds?: string[];
  /** Extra ids to hide beyond the current squad. */
  excludeIds?: string[];
  /** Optional filter fn (e.g., same-slot only). If omitted, shows all players */
  filter?: (p: EditPlayer) => boolean;

  /** Auction context. Absent/slot_based skips the purse maths. */
  contestFormat?: ContestFormat;
  purse?: number;
  maxPerTeam?: number;

  onSelect: (playerId: string) => void;
}

export const ReplacePlayerModal: React.FC<ReplacePlayerModalProps> = ({
  isOpen,
  onClose,
  targetPlayerId,
  players,
  currentPlayerIds = [],
  excludeIds = [],
  filter,
  contestFormat,
  purse = 0,
  maxPerTeam = 0,
  onSelect,
}) => {
  const isAuction = contestFormat === CONTEST_FORMAT.AUCTION_PURSE;

  const playerById = useMemo(() => {
    const map: Record<string, EditPlayer> = {};
    players.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [players]);

  const target = targetPlayerId ? playerById[targetPlayerId] : undefined;

  /**
   * What a replacement may cost: the purse minus the rest of the squad, i.e.
   * the outgoing player's fee is handed back before the incoming one is paid.
   */
  const budgetForSwap = useMemo(() => {
    if (!isAuction) return Number.POSITIVE_INFINITY;
    const spentByOthers = currentPlayerIds
      .filter((id) => id !== targetPlayerId)
      .reduce((sum, id) => sum + (playerById[id]?.price || 0), 0);
    return purse - spentByOthers;
  }, [isAuction, currentPlayerIds, targetPlayerId, playerById, purse]);

  /** Squad counts per real-world team, with the outgoing player already removed. */
  const countByTeamAfterRemoval = useMemo(() => {
    const counts: Record<string, number> = {};
    currentPlayerIds
      .filter((id) => id !== targetPlayerId)
      .forEach((id) => {
        const team = playerById[id]?.team;
        if (team) counts[team] = (counts[team] || 0) + 1;
      });
    return counts;
  }, [currentPlayerIds, targetPlayerId, playerById]);

  const candidates = useMemo(() => {
    const excluded = new Set([...excludeIds, ...currentPlayerIds]);
    let arr = players.filter((p) => !excluded.has(p.id));
    if (filter) arr = arr.filter(filter);
    return arr;
  }, [players, excludeIds, currentPlayerIds, filter]);

  const filters = usePlayerPoolFilters(candidates, []);
  const { reset: resetFilters } = filters;

  // The modal stays mounted while isOpen toggles, so usePlayerPoolFilters'
  // state would otherwise carry over into the next replacement session —
  // a different squad or contest could open to an empty or unexpectedly
  // restricted list.
  useEffect(() => {
    if (isOpen) resetFilters();
    // Only isOpen's false->true edge should start a new session; a
    // changing resetFilters identity must not re-trigger it mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const blockReasonFor = (p: EditPlayer): string | null => {
    if (!isAuction) return null;
    if (maxPerTeam > 0 && p.team) {
      if ((countByTeamAfterRemoval[p.team] || 0) >= maxPerTeam) {
        return `Already ${maxPerTeam} from ${p.team}.`;
      }
    }
    if ((p.price || 0) > budgetForSwap) {
      return `Costs ${formatPoints(p.price || 0)}, budget ${formatPoints(
        budgetForSwap,
      )}.`;
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
      <div className="bg-[#130D2A] rounded-t-2xl sm:rounded-xl shadow-pink-soft border border-white/10 w-full sm:max-w-2xl flex flex-col max-h-[92dvh]">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-white/[0.08] shrink-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-text-main">Replace Player</h3>
            {target && (
              <p className="text-xs text-text-muted truncate">
                Replacing{" "}
                <span className="font-medium text-text-main">
                  {target.name}
                </span>
                {isAuction && (
                  <>
                    {" · budget "}
                    <span className="font-semibold text-accent-pink-500 tabular-nums">
                      {formatPoints(budgetForSwap)}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-text-muted hover:text-text-main hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-4 sm:px-5 py-3 border-b border-white/[0.06] shrink-0">
          <PoolFilterBar
            query={filters.query}
            onQueryChange={filters.setQuery}
            status={filters.status}
            onStatusChange={filters.setStatus}
            counts={filters.counts}
            teamFilter={filters.teamFilter}
            onTeamFilterChange={filters.setTeamFilter}
            teamOptions={filters.teamOptions}
            sort={filters.sort}
            onSortChange={filters.setSort}
            priceBuckets={filters.priceBuckets}
            priceBucketIndex={filters.priceBucketIndex}
            onPriceBucketChange={filters.setPriceBucketIndex}
            contestFormat={contestFormat}
            showStatusChips={false}
            hasActiveFilters={filters.hasActiveFilters}
            onReset={filters.reset}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {filters.filtered.map((p) => {
              const reason = blockReasonFor(p);
              return (
                <PlayerListItem
                  key={p.id}
                  player={p}
                  subtitle={`${p.role || "Slot"} • ${p.team || ""}`}
                  rightText={
                    isAuction
                      ? formatPlayerValue(p.price || 0, contestFormat)
                      : undefined
                  }
                  note={reason ?? undefined}
                  disabled={reason !== null}
                  onClick={() => onSelect(p.id)}
                />
              );
            })}
          </div>
          {filters.filtered.length === 0 && (
            <div className="text-sm text-text-muted text-center py-6">
              No players match your search.
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-white/[0.08] flex justify-end shrink-0 safe-area-bottom">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-text-main hover:bg-bg-card-soft"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
