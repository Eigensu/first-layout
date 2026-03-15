"use client";

import React, { useState, useMemo } from "react";
import { Search, X, Check, Star, Crown } from "lucide-react";
import { getInitials, getSlotGradient } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface EditablePlayer {
  id: string;
  name: string;
  team?: string;
  role?: string;
  image?: string;
  points?: number;
  slot?: string;
}

export interface EditPlayersModalProps {
  isOpen: boolean;
  onClose: () => void;

  /** The team being edited */
  teamId: string;
  teamName: string;

  /** Current squad */
  currentPlayerIds: string[];
  captainId: string | null | undefined;
  viceCaptainId: string | null | undefined;

  /** All available players to pick from */
  allPlayers: EditablePlayer[];

  /** Required squad size (default 16) */
  requiredCount?: number;
  slotLimits?: Record<string | number, number>;

  saving: boolean;
  onSave: (payload: {
    player_ids: string[];
    captain_id: string;
    vice_captain_id: string;
  }) => void;

  roleToSlotLabel: (role: string) => string;
  getRoleAvatarGradient: (role: string) => string | undefined;
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
  disableAdd,
  disableReason,
}: {
  player: EditablePlayer;
  selected: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  onToggle: () => void;
  onMakeCaptain: () => void;
  onMakeViceCaptain: () => void;
  disableAdd: boolean;
  disableReason: string;
}) {
  const slotNum = slotNumForRole(player.role);
  const gradient = getSlotGradient(slotNum);

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
        selected
          ? "bg-primary-600/15 border border-primary-500/30"
          : "bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06]"
      }`}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div
          className={`w-9 h-9 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold overflow-hidden`}
        >
          {player.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={player.image} alt={player.name} className="w-full h-full object-cover" />
          ) : (
            getInitials(player.name)
          )}
        </div>
        {(isCaptain || isViceCaptain) && (
          <span
            className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[7px] font-extrabold flex items-center justify-center ring-1 ring-bg-card ${
              isCaptain ? "bg-amber-400 text-amber-900" : "bg-purple-400 text-purple-900"
            }`}
          >
            {isCaptain ? "C" : "VC"}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-main truncate">{player.name}</p>
        <p className="text-[11px] text-text-muted truncate">{player.team}</p>
      </div>

      {/* C / VC buttons (only when selected) */}
      {selected && (
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onMakeCaptain}
            title="Make Captain"
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all ${
              isCaptain
                ? "bg-amber-400 text-amber-900"
                : "bg-white/10 text-white/50 hover:bg-amber-400/20 hover:text-amber-300"
            }`}
          >
            C
          </button>
          <button
            onClick={onMakeViceCaptain}
            title="Make Vice-Captain"
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all ${
              isViceCaptain
                ? "bg-purple-400 text-purple-900"
                : "bg-white/10 text-white/50 hover:bg-purple-400/20 hover:text-purple-300"
            }`}
          >
            VC
          </button>
        </div>
      )}

      {/* Add / Remove toggle */}
      <button
        onClick={onToggle}
        disabled={!selected && disableAdd}
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 ${
          selected
            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            : disableAdd
            ? "bg-white/5 text-white/20 cursor-not-allowed"
            : "bg-primary-600/20 text-primary-300 hover:bg-primary-600/30"
        }`}
        title={selected ? "Remove from squad" : disableReason}
      >
        {selected ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export function EditPlayersModal({
  isOpen,
  onClose,
  teamId,
  teamName,
  currentPlayerIds,
  captainId: initialCaptainId,
  viceCaptainId: initialViceCaptainId,
  allPlayers,
  requiredCount = 16,
  slotLimits = {},
  saving,
  onSave,
  roleToSlotLabel,
  getRoleAvatarGradient,
}: EditPlayersModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => [...currentPlayerIds]);
  const [captainId, setCaptainId] = useState<string>(initialCaptainId || "");
  const [viceCaptainId, setViceCaptainId] = useState<string>(initialViceCaptainId || "");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"squad" | "available">("squad");

  // Reset when opening
  React.useEffect(() => {
    if (isOpen) {
      setSelectedIds([...currentPlayerIds]);
      setCaptainId(initialCaptainId || "");
      setViceCaptainId(initialViceCaptainId || "");
      setQuery("");
      setTab("squad");
    }
  }, [isOpen, currentPlayerIds, initialCaptainId, initialViceCaptainId]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const count = selectedIds.length;
  const isValid = count === requiredCount && captainId && viceCaptainId && captainId !== viceCaptainId;

  const selectedCountBySlot = useMemo(() => {
    const counts: Record<string, number> = {};
    selectedIds.forEach((id) => {
      const p = allPlayers.find((ap) => ap.id === id);
      const sid = String(p?.slot || "");
      if (sid) counts[sid] = (counts[sid] || 0) + 1;
    });
    return counts;
  }, [selectedIds, allPlayers]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        if (captainId === id) setCaptainId("");
        if (viceCaptainId === id) setViceCaptainId("");
        return next;
      }
      const player = allPlayers.find((p) => p.id === id);
      const sid = String(player?.slot || "");
      const currentSlotCount = selectedCountBySlot[sid] || 0;
      const limit = slotLimits[sid] || 4;
      if (prev.length >= requiredCount || currentSlotCount >= limit) return prev;
      return [...prev, id];
    });
  };

  const makeCaptain = (id: string) => {
    if (viceCaptainId === id) setViceCaptainId("");
    setCaptainId(id);
  };

  const makeViceCaptain = (id: string) => {
    if (captainId === id) setCaptainId("");
    setViceCaptainId(id);
  };

  // Filtered players
  const q = query.toLowerCase();
  const squadPlayers = allPlayers.filter((p) => selectedSet.has(p.id) && (q ? p.name.toLowerCase().includes(q) || (p.team || "").toLowerCase().includes(q) : true));
  const availablePlayers = allPlayers.filter((p) => !selectedSet.has(p.id) && (q ? p.name.toLowerCase().includes(q) || (p.team || "").toLowerCase().includes(q) : true));

  const displayed = tab === "squad" ? squadPlayers : availablePlayers;

  if (!isOpen) return null;

  const counterColor =
    count === requiredCount
      ? "text-emerald-400"
      : count > requiredCount
      ? "text-red-400"
      : "text-amber-400";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-[#130D2A] border-t border-white/10 shadow-2xl max-h-[92dvh]">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 border-b border-white/[0.08] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white leading-tight">Edit Squad</h2>
            <p className="text-xs text-white/40">{teamName}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Counter */}
            <span className={`text-sm font-bold tabular-nums ${counterColor}`}>
              {count}
              <span className="text-white/30 font-normal">/{requiredCount}</span>
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>

        {/* Validation nudges */}
        {(!captainId || !viceCaptainId) && count === requiredCount && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
            {!captainId && !viceCaptainId
              ? "Tap a player to assign Captain and Vice-Captain."
              : !captainId
              ? "Please assign a Captain."
              : "Please assign a Vice-Captain."}
          </div>
        )}
        {captainId && viceCaptainId && captainId === viceCaptainId && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            Captain and Vice-Captain must be different players.
          </div>
        )}

        {/* Tabs */}
        <div className="flex mx-4 mt-3 rounded-xl bg-white/[0.04] p-1 gap-1 border border-white/[0.06]">
          {(["squad", "available"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === t
                  ? "bg-primary-600 text-white shadow"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {t === "squad" ? `My Squad (${count})` : `Available (${availablePlayers.length})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mx-4 mt-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player or team..."
            className="w-full pl-8 pr-3 py-2 text-sm bg-white/[0.04] border border-white/[0.08] rounded-xl text-text-main placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
          {displayed.length === 0 && (
            <p className="text-center text-white/30 text-sm py-6">No players found.</p>
          )}
          {displayed.map((p) => {
            const sid = String(p.slot || "");
            const slotCount = selectedCountBySlot[sid] || 0;
            const limit = slotLimits[sid] || 4;
            const isSlotFull = slotCount >= limit;
            const isTotalFull = count >= requiredCount;
            const disableReason = isTotalFull
              ? `Squad is full (${requiredCount} players)`
              : isSlotFull
              ? `Slot is full (max ${limit})`
              : "Add to squad";

            return (
              <PlayerRow
                key={p.id}
                player={p}
                selected={selectedSet.has(p.id)}
                isCaptain={captainId === p.id}
                isViceCaptain={viceCaptainId === p.id}
                onToggle={() => toggle(p.id)}
                onMakeCaptain={() => makeCaptain(p.id)}
                onMakeViceCaptain={() => makeViceCaptain(p.id)}
                disableAdd={!selectedSet.has(p.id) && (isTotalFull || isSlotFull)}
                disableReason={disableReason}
              />
            );
          })}
        </div>

        {/* Save bar */}
        <div className="px-4 py-4 border-t border-white/[0.08] safe-area-bottom">
          <button
            onClick={() => {
              if (!isValid) return;
              onSave({ player_ids: selectedIds, captain_id: captainId, vice_captain_id: viceCaptainId });
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
