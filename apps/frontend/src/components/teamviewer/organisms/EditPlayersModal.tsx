"use client";

import React, { useState, useMemo, useCallback } from "react";
import { X, Check, Lock } from "lucide-react";
import { getInitials, getSlotGradient } from "../types";
import { CONTEST_FORMAT, type ContestFormat } from "@/common/consts/contest";
import { formatPlayerValue, formatPoints } from "@/utils/playerValue";
import { PoolFilterBar } from "@/components/team/Edit/PoolFilterBar";
import { EditPurseBar } from "@/components/team/Edit/EditPurseBar";
import {
  POOL_STATUS,
  usePlayerPoolFilters,
} from "@/components/team/Edit/usePlayerPoolFilters";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface EditablePlayer {
  id: string;
  name: string;
  team?: string;
  role?: string;
  image?: string;
  points?: number;
  slot?: string;
  /** Auction sale value. Ignored in slot-based contests. */
  price?: number;
}

export interface EditPlayersModalProps {
  isOpen: boolean;
  onClose: () => void;

  teamName: string;

  /** Current squad */
  currentPlayerIds: string[];
  captainId: string | null | undefined;
  viceCaptainId: string | null | undefined;

  /** All available players to pick from */
  allPlayers: EditablePlayer[];

  /** Required squad size (slot-based: sum of slot maxima; auction: squad_size) */
  requiredCount?: number;
  slotLimits?: Record<string | number, number>;

  /** Auction context. Absent/slot_based keeps the slot rules. */
  contestFormat?: ContestFormat;
  purse?: number;
  maxPerTeam?: number;

  saving: boolean;
  onSave: (payload: {
    player_ids: string[];
    captain_id: string;
    vice_captain_id: string;
  }) => void;
}

// ── Helper: slot label → colour ───────────────────────────────────────────────
function slotNumForRole(role = "") {
  const r = role.toLowerCase();
  if (r.includes("batsman") || r.includes("batsmen")) return 1;
  if (r.includes("bowler")) return 2;
  if (r.includes("all-rounder") || r.includes("allrounder")) return 3;
  if (r.includes("wicket")) return 4;
  return 1;
}

// ── Player row inside modal ───────────────────────────────────────────────────
function PlayerRow({
  player,
  selected,
  isCaptain,
  isViceCaptain,
  onToggle,
  onMakeCaptain,
  onMakeViceCaptain,
  blockReason,
  showValue,
  contestFormat,
}: {
  player: EditablePlayer;
  selected: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  onToggle: () => void;
  onMakeCaptain: () => void;
  onMakeViceCaptain: () => void;
  /** Why this player cannot be added, or null when they can. */
  blockReason: string | null;
  showValue: boolean;
  contestFormat?: ContestFormat;
}) {
  const slotNum = slotNumForRole(player.role);
  const gradient = getSlotGradient(slotNum);
  const blocked = !selected && blockReason !== null;

  return (
    <div
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-all duration-150 ${
        selected
          ? "bg-accent-pink-tonal border-accent-pink-edge"
          : blocked
            ? "bg-white/[0.02] border-white/[0.04] opacity-60"
            : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]"
      }`}
    >
      {/*
        No C/VC pip on the avatar: it can only ever appear on a selected row,
        which already shows the lit C and VC buttons a few millimetres to the
        right. Two markers for one piece of state is what made the list noisy.
      */}
      <div
        className={`w-9 h-9 shrink-0 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold overflow-hidden`}
      >
        {player.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.image}
            alt={player.name}
            className="w-full h-full object-cover"
          />
        ) : (
          getInitials(player.name)
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] sm:text-sm font-medium text-text-main truncate leading-tight">
          {player.name}
        </p>
        <p className="text-[10px] sm:text-[11px] text-text-muted truncate">
          {player.team}
          {showValue && (
            <>
              {player.team ? " · " : ""}
              <span className="font-semibold text-accent-pink-500 tabular-nums">
                {formatPlayerValue(player.price || 0, contestFormat)}
              </span>
            </>
          )}
        </p>
        {/* Blocked rows say why outright: a tooltip never reaches touch users. */}
        {blocked && (
          <p className="text-[10px] text-warning truncate">{blockReason}</p>
        )}
      </div>

      {/* C / VC buttons (only when selected) */}
      {selected && (
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onMakeCaptain}
            title="Make Captain"
            aria-label={`Make ${player.name} captain`}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all active:scale-90 ${
              isCaptain
                ? "bg-warning text-bg-body"
                : "bg-white/10 text-text-muted hover:bg-warning-tonal-hover hover:text-warning"
            }`}
          >
            C
          </button>
          <button
            onClick={onMakeViceCaptain}
            title="Make Vice-Captain"
            aria-label={`Make ${player.name} vice-captain`}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all active:scale-90 ${
              isViceCaptain
                ? "bg-accent-pink-500 text-bg-body"
                : "bg-white/10 text-text-muted hover:bg-accent-pink-tonal-hover hover:text-accent-pink-500"
            }`}
          >
            VC
          </button>
        </div>
      )}

      {/* Add / Remove toggle */}
      {/*
        Why the tick was invisible: it was `bg-primary-600/20 text-primary-300`,
        and both halves failed. Tailwind emits no rule for an opacity modifier on
        a var() colour, so there was no fill; and `primary-300` maps to --bg-chip,
        a dark purple, leaving the glyph at ~2.9:1 on this sheet. Tonal tokens give
        a real fill, and add/remove now differ in hue as well as glyph.
      */}
      <button
        onClick={onToggle}
        disabled={blocked}
        className={`shrink-0 w-9 h-9 rounded-full border flex items-center justify-center transition-all active:scale-90 ${
          selected
            ? "bg-danger-tonal border-danger-edge text-danger hover:bg-danger-tonal-hover"
            : blocked
              ? "bg-white/[0.03] border-white/10 text-text-subtle cursor-not-allowed"
              : "bg-success-tonal border-success-edge text-success hover:bg-success-tonal-hover"
        }`}
        title={selected ? "Remove from squad" : (blockReason ?? "Add to squad")}
        aria-label={
          selected
            ? `Remove ${player.name} from squad`
            : `Add ${player.name} to squad`
        }
      >
        {selected ? (
          <X className="w-4 h-4" strokeWidth={2.5} />
        ) : blocked ? (
          <Lock className="w-3.5 h-3.5" />
        ) : (
          <Check className="w-[18px] h-[18px]" strokeWidth={3} />
        )}
      </button>
    </div>
  );
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted px-1 pt-1">
      {label} ({count})
    </p>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export function EditPlayersModal({
  isOpen,
  onClose,
  teamName,
  currentPlayerIds,
  captainId: initialCaptainId,
  viceCaptainId: initialViceCaptainId,
  allPlayers,
  requiredCount = 16,
  slotLimits = {},
  contestFormat,
  purse = 0,
  maxPerTeam = 0,
  saving,
  onSave,
}: EditPlayersModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => [
    ...currentPlayerIds,
  ]);
  const [captainId, setCaptainId] = useState<string>(initialCaptainId || "");
  const [viceCaptainId, setViceCaptainId] = useState<string>(
    initialViceCaptainId || "",
  );

  const isAuction = contestFormat === CONTEST_FORMAT.AUCTION_PURSE;

  const filters = usePlayerPoolFilters(allPlayers, selectedIds, isAuction);
  const { reset: resetFilters } = filters;

  // Reset when opening
  React.useEffect(() => {
    if (isOpen) {
      setSelectedIds([...currentPlayerIds]);
      setCaptainId(initialCaptainId || "");
      setViceCaptainId(initialViceCaptainId || "");
      resetFilters();
    }
    // resetFilters is intentionally excluded: it is recreated every render, and
    // including it would clear the user's filters on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentPlayerIds, initialCaptainId, initialViceCaptainId]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const playerById = useMemo(() => {
    const map: Record<string, EditablePlayer> = {};
    allPlayers.forEach((player) => {
      map[player.id] = player;
    });
    return map;
  }, [allPlayers]);

  const count = selectedIds.length;

  const spent = useMemo(
    () =>
      selectedIds.reduce((sum, id) => sum + (playerById[id]?.price || 0), 0),
    [selectedIds, playerById],
  );
  const remainingPurse = purse - spent;

  const selectedCountByTeam = useMemo(() => {
    const counts: Record<string, number> = {};
    selectedIds.forEach((id) => {
      const team = playerById[id]?.team;
      if (team) counts[team] = (counts[team] || 0) + 1;
    });
    return counts;
  }, [selectedIds, playerById]);

  const selectedCountBySlot = useMemo(() => {
    const counts: Record<string, number> = {};
    selectedIds.forEach((id) => {
      const sid = String(playerById[id]?.slot || "");
      if (sid) counts[sid] = (counts[sid] || 0) + 1;
    });
    return counts;
  }, [selectedIds, playerById]);

  /**
   * Why an unselected player cannot be added, or null when they can.
   *
   * Mirrors what the server enforces on update (validate_auction_squad /
   * _validate_slot_constraints) so the sheet can refuse a pick and say why,
   * instead of letting Save fail with a 400 after the work is done.
   */
  const blockReasonFor = useCallback(
    (player: EditablePlayer): string | null => {
      if (selectedSet.has(player.id)) return null;

      if (count >= requiredCount) {
        return `Squad is full (${requiredCount} players).`;
      }

      if (isAuction) {
        if (maxPerTeam > 0 && player.team) {
          const fromSameTeam = selectedCountByTeam[player.team] || 0;
          if (fromSameTeam >= maxPerTeam) {
            return `Already ${maxPerTeam} from ${player.team}.`;
          }
        }
        const price = player.price || 0;
        if (price > remainingPurse) {
          return `Costs ${formatPoints(price)}, only ${formatPoints(
            remainingPurse,
          )} left.`;
        }
        return null;
      }

      const sid = String(player.slot || "");
      const limit = slotLimits[sid] || 4;
      if ((selectedCountBySlot[sid] || 0) >= limit) {
        return `Slot is full (max ${limit}).`;
      }
      return null;
    },
    [
      selectedSet,
      count,
      requiredCount,
      isAuction,
      maxPerTeam,
      selectedCountByTeam,
      remainingPurse,
      slotLimits,
      selectedCountBySlot,
    ],
  );

  const toggle = (id: string) => {
    const player = playerById[id];
    if (!player) return;
    if (selectedSet.has(id)) {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      if (captainId === id) setCaptainId("");
      if (viceCaptainId === id) setViceCaptainId("");
      return;
    }
    if (blockReasonFor(player) !== null) return;
    setSelectedIds((prev) => [...prev, id]);
  };

  const makeCaptain = (id: string) => {
    if (viceCaptainId === id) setViceCaptainId("");
    setCaptainId(id);
  };

  const makeViceCaptain = (id: string) => {
    if (captainId === id) setCaptainId("");
    setViceCaptainId(id);
  };

  const overspent = isAuction && remainingPurse < 0;
  const isValid =
    count === requiredCount &&
    !!captainId &&
    !!viceCaptainId &&
    captainId !== viceCaptainId &&
    !overspent;

  if (!isOpen) return null;

  const counterColor =
    count === requiredCount
      ? "text-success"
      : count > requiredCount
        ? "text-danger"
        : "text-warning";

  const showSections = filters.status === POOL_STATUS.ALL;

  /**
   * One notice at a time, worst first. Three independent banners could stack
   * (over the purse *and* a duplicate captain), pushing the list off a phone
   * screen to say things the user can only fix one at a time anyway.
   */
  const notice: { tone: "danger" | "warning"; text: string } | null = overspent
    ? {
        tone: "danger",
        text: `Over the purse by ${formatPoints(Math.abs(remainingPurse))} — remove a player to save.`,
      }
    : captainId && captainId === viceCaptainId
      ? { tone: "danger", text: "Captain and Vice-Captain must differ." }
      : count === requiredCount && !captainId && !viceCaptainId
        ? { tone: "warning", text: "Tap C and VC on players to assign them." }
        : count === requiredCount && !captainId
          ? { tone: "warning", text: "Assign a Captain." }
          : count === requiredCount && !viceCaptainId
            ? { tone: "warning", text: "Assign a Vice-Captain." }
            : null;

  const renderRow = (p: EditablePlayer) => (
    <PlayerRow
      key={p.id}
      player={p}
      selected={selectedSet.has(p.id)}
      isCaptain={captainId === p.id}
      isViceCaptain={viceCaptainId === p.id}
      onToggle={() => toggle(p.id)}
      onMakeCaptain={() => makeCaptain(p.id)}
      onMakeViceCaptain={() => makeViceCaptain(p.id)}
      blockReason={blockReasonFor(p)}
      showValue={isAuction}
      contestFormat={contestFormat}
    />
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-squad-title"
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-[#130D2A] border-t border-white/10 shadow-2xl max-h-[92dvh]"
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header — squad name rides on the title line so it costs no extra row */}
        <div className="px-3 sm:px-4 pb-2 border-b border-white/[0.08] flex items-center justify-between gap-2">
          <h2
            id="edit-squad-title"
            className="min-w-0 text-sm sm:text-base font-bold text-text-main leading-tight truncate"
          >
            Edit Squad
            <span className="font-normal text-text-muted"> · {teamName}</span>
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-sm font-bold tabular-nums ${counterColor}`}>
              {count}
              <span className="text-white/30 font-normal">
                /{requiredCount}
              </span>
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>

        {/* Sticky controls */}
        <div className="px-3 sm:px-4 pt-2 pb-2 space-y-2 border-b border-white/[0.06]">
          {isAuction && (
            <EditPurseBar
              purse={purse}
              spent={spent}
              selectedCount={count}
              squadSize={requiredCount}
            />
          )}

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
            hasActiveFilters={filters.hasActiveFilters}
            onReset={filters.reset}
          />
        </div>

        {/* Validation nudge — at most one */}
        {notice && (
          <div
            role="status"
            className={`mx-3 sm:mx-4 mt-2 px-2.5 py-1.5 rounded-lg border text-[11px] ${
              notice.tone === "danger"
                ? "bg-danger-tonal border-danger-edge text-danger"
                : "bg-warning-tonal border-warning-edge text-warning"
            }`}
          >
            {notice.text}
          </div>
        )}

        {/* Player list */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2 space-y-1.5 min-h-0">
          {filters.filtered.length === 0 && (
            <p className="text-center text-text-muted text-xs py-6">
              No players match your search.
            </p>
          )}

          {showSections ? (
            <>
              {filters.inSquad.length > 0 && (
                <>
                  <SectionHeading
                    label="In squad"
                    count={filters.inSquad.length}
                  />
                  {filters.inSquad.map(renderRow)}
                </>
              )}
              {filters.available.length > 0 && (
                <>
                  <SectionHeading
                    label="Available"
                    count={filters.available.length}
                  />
                  {filters.available.map(renderRow)}
                </>
              )}
            </>
          ) : (
            filters.filtered.map(renderRow)
          )}
        </div>

        {/* Save bar */}
        <div className="px-3 sm:px-4 py-3 border-t border-white/[0.08] safe-area-bottom">
          <button
            onClick={() => {
              if (!isValid) return;
              onSave({
                player_ids: selectedIds,
                captain_id: captainId,
                vice_captain_id: viceCaptainId,
              });
            }}
            disabled={!isValid || saving}
            className="w-full py-3 rounded-xl bg-gradient-brand text-white text-sm font-bold shadow-lg shadow-primary-900/40 hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}
