"use client";

import React, { useState, useMemo } from "react";
import { Card, Button } from "@/components";
import { ViewToggle } from "../atoms/ViewToggle";
import { TeamHeader } from "../TeamHeader";
import { PitchView } from "./PitchView";
import { getInitials, getSlotGradient } from "../types";
import {
  type TeamViewMode,
  type TeamBasic,
  type PlayerBasic,
  type ContestTeamData,
  type TeamEnrollmentMeta,
  transformToPitchPlayers,
} from "../types";
import { Pencil, Trash2 } from "lucide-react";

export interface TeamViewerProps {
  team: TeamBasic;
  players: PlayerBasic[];
  contestIdParam?: string;
  contestData?: ContestTeamData;
  enrollment?: TeamEnrollmentMeta;
  enrollSuccess?: { contestId: string; contestName: string };

  // Editing / rename
  isEditing: boolean;
  editingName: string;
  renaming: boolean;
  onEditingNameChange: (v: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;

  // Actions
  onOpenDelete: () => void;
  deleting: boolean;
  onOpenPlayerActions: (playerId: string) => void;

  // Edit squad (live contests only)
  contestStatus?: string;           // "live" | "ongoing" | "completed" etc.
  onEditPlayers?: () => void;

  // View mode
  initialView?: TeamViewMode;
  onViewChange?: (view: TeamViewMode) => void;
}

function slotNumForRole(role = "") {
  const r = role.toLowerCase();
  if (r.includes("batsman") || r.includes("batsmen")) return 1;
  if (r.includes("bowler")) return 2;
  if (r.includes("all-rounder") || r.includes("allrounder")) return 3;
  if (r.includes("wicket")) return 4;
  return 1;
}

// ── Player chip ──────────────────────────────────────────────────────────────
function PlayerChip({
  player,
  isCaptain,
  isViceCaptain,
  points,
  slotNum,
  onClick,
}: {
  player: PlayerBasic;
  isCaptain: boolean;
  isViceCaptain: boolean;
  points: number;
  slotNum: number;
  onClick: () => void;
}) {
  const initials = getInitials(player.name);
  const gradient = getSlotGradient(slotNum);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-1 w-[70px] flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-bg-card"
    >
      {/* Avatar */}
      <div className="relative">
        <div
          className={`w-11 h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold shadow-md group-hover:scale-105 transition-transform overflow-hidden`}
        >
          {player.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={player.image} alt={player.name} className="w-full h-full object-cover" />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        {/* C / VC badge */}
        {(isCaptain || isViceCaptain) && (
          <span
            className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-[9px] font-extrabold flex items-center justify-center shadow ring-2 ring-bg-card ${
              isCaptain
                ? "bg-amber-400 text-amber-900"
                : "bg-purple-400 text-purple-900"
            }`}
          >
            {isCaptain ? "C" : "VC"}
          </span>
        )}
      </div>

      {/* Name */}
      <span className="text-[10px] text-text-main font-medium leading-tight text-center line-clamp-2 w-full">
        {player.name}
      </span>

      {/* Points */}
      <span className="text-[9px] text-text-muted">{points.toFixed(1)} pts</span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function TeamViewer({
  team,
  players,
  contestIdParam,
  contestData,
  enrollment,
  enrollSuccess,
  isEditing,
  editingName,
  renaming,
  onEditingNameChange,
  onSaveRename,
  onCancelRename,
  onStartRename,
  onOpenDelete,
  deleting,
  onOpenPlayerActions,
  contestStatus,
  onEditPlayers,
  initialView = "list",
  onViewChange,
}: TeamViewerProps) {
  const [viewMode, setViewMode] = useState<TeamViewMode>(initialView);

  const handleViewChange = (view: TeamViewMode) => {
    setViewMode(view);
    onViewChange?.(view);
  };

  // Team players
  const teamPlayers = useMemo(
    () => players.filter((p) => team.player_ids.includes(p.id)),
    [players, team.player_ids]
  );

  // Pitch players
  const pitchPlayers = useMemo(
    () =>
      transformToPitchPlayers(
        teamPlayers,
        team.captain_id,
        team.vice_captain_id,
        contestData
      ),
    [teamPlayers, team.captain_id, team.vice_captain_id, contestData]
  );

  // Points helpers
  const displayPoints =
    contestIdParam && contestData
      ? contestData.contest_points || 0
      : team.total_points || 0;

  const contestMap = useMemo(
    () =>
      new Map<string, number>(
        (contestData?.players || []).map((p) => [p.id, p.contest_points || 0])
      ),
    [contestData]
  );

  const getPlayerPoints = (p: PlayerBasic) =>
    contestMap.has(p.id) ? contestMap.get(p.id)! : p.points || 0;

  // Role-grouped players (dynamic based on actual player roles)
  const grouped = useMemo(() => {
    const map = new Map<string, { players: PlayerBasic[]; slotNum: number }>();
    
    for (const p of teamPlayers) {
      // Use the player's role, or fallback to "Player" if missing
      const roleStr = p.role || "Player";
      
      if (!map.has(roleStr)) {
        map.set(roleStr, { players: [], slotNum: slotNumForRole(roleStr) });
      }
      map.get(roleStr)!.players.push(p);
    }
    
    // Sort array by slotNum to keep Batsmen first, Bowlers second, etc.
    return Array.from(map.entries()).sort((a, b) => a[1].slotNum - b[1].slotNum);
  }, [teamPlayers]);

  // Edit button visibility
  const showEditButton = !!enrollment; // only if enrolled in ANY contest
  const canEdit = contestStatus === "live";
  const editDisabledReason = !canEdit
    ? contestStatus === "ongoing"
      ? "Team editing is disabled during ongoing contests"
      : "Team editing is only available during live contests"
    : undefined;

  return (
    <Card className="p-4 sm:p-5 border border-border-subtle hover:border-accent-pink-500/30 transition-all duration-200 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-start gap-2">
          {isEditing ? (
            <div className="flex-1 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-bg-card-soft border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-text-main placeholder:text-text-muted"
                placeholder="Enter team name"
                maxLength={100}
                autoFocus
              />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={onSaveRename} disabled={renaming} className="flex-1 sm:flex-none">
                  {renaming ? "Saving..." : "Save"}
                </Button>
                <Button variant="ghost" size="sm" onClick={onCancelRename} disabled={renaming} className="flex-1 sm:flex-none">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <TeamHeader
                teamName={team.team_name}
                createdAt={team.created_at}
                displayPoints={displayPoints}
                onClickRename={onStartRename}
                totalPoints={team.total_points}
                rank={team.rank || undefined}
                contestName={enrollment?.contestName}
                contestLink={enrollment ? `/contests/${enrollment.contestId}/leaderboard` : undefined}
              />
              <ViewToggle currentView={viewMode} onViewChange={handleViewChange} />
            </>
          )}
        </div>

        {/* Enrollment success */}
        {enrollSuccess && (
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
            Joined <span className="font-semibold">{enrollSuccess.contestName}</span>.{" "}
            {enrollSuccess.contestId && (
              <a href={`/contests/${enrollSuccess.contestId}`} className="underline">
                View contest
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── View Content ── */}
      {viewMode === "pitch" ? (
        <PitchView
          team={team}
          players={pitchPlayers}
          enrollment={enrollment}
          onPlayerClick={onOpenPlayerActions}
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([groupLabel, { players: groupPlayers, slotNum }]) => (
            <div key={groupLabel}>
              {/* Group label */}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`w-2 h-2 rounded-full bg-gradient-to-br ${getSlotGradient(slotNum)}`}
                />
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                  {groupLabel} ({groupPlayers.length})
                </span>
              </div>
              {/* Chips row */}
              <div className="flex flex-wrap gap-3">
                {groupPlayers.map((p) => (
                  <PlayerChip
                    key={p.id}
                    player={p}
                    isCaptain={p.id === team.captain_id}
                    isViceCaptain={p.id === team.vice_captain_id}
                    points={getPlayerPoints(p)}
                    slotNum={slotNum}
                    onClick={() => onOpenPlayerActions(p.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-border-subtle">
        {/* Edit Team (only visible if enrolled in a contest) */}
        {showEditButton ? (
          <button
            onClick={canEdit ? onEditPlayers : undefined}
            disabled={!canEdit}
            title={editDisabledReason}
            className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
              canEdit
                ? "bg-white/10 text-white hover:bg-white/20 active:scale-95 cursor-pointer ring-1 ring-white/20"
                : "bg-white/5 text-white/25 cursor-not-allowed"
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Team
          </button>
        ) : (
          <div /> /* spacer so Delete stays right */
        )}

        {/* Delete */}
        <button
          onClick={onOpenDelete}
          disabled={deleting}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 hover:text-red-300 hover:ring-red-500/30 transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ring-1 ring-red-500/20"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </Card>
  );
}
