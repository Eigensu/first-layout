"use client";

import React, { useState, useMemo } from "react";
import { Card, Button } from "@/components";
import { ViewToggle } from "../atoms/ViewToggle";
import { TeamHeader } from "../TeamHeader";
import { ContestMetaBadges } from "../molecules/ContestMetaBadges";
import { CaptainRow, ViceCaptainRow } from "../LeaderRow";
import { SquadList } from "../SquadList";
import { PitchView } from "./PitchView";
import {
  type TeamViewMode,
  type TeamBasic,
  type PlayerBasic,
  type ContestTeamData,
  type TeamEnrollmentMeta,
  transformToPitchPlayers,
} from "../types";

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

  // Utilities
  roleToSlotLabel: (role: string) => string;
  getRoleAvatarGradient: (role: string) => string | undefined;

  // View mode
  initialView?: TeamViewMode;
  onViewChange?: (view: TeamViewMode) => void;
}

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
  roleToSlotLabel,
  getRoleAvatarGradient,
  initialView = "list",
  onViewChange,
}: TeamViewerProps) {
  const [viewMode, setViewMode] = useState<TeamViewMode>(initialView);

  const handleViewChange = (view: TeamViewMode) => {
    setViewMode(view);
    onViewChange?.(view);
  };

  // Get team players
  const teamPlayers = useMemo(
    () => players.filter((p) => team.player_ids.includes(p.id)),
    [players, team.player_ids]
  );

  // Transform players for pitch view
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

  // Find captain and vice-captain
  const captain = players.find((p) => p.id === team.captain_id);
  const viceCaptain = players.find((p) => p.id === team.vice_captain_id);

  // Display points
  const displayPoints =
    contestIdParam && contestData
      ? contestData.contest_points || 0
      : team.total_points || 0;

  // Get captain/VC points
  const getCaptainPoints = () => {
    if (contestIdParam && contestData && captain) {
      const entry = contestData.players.find((p) => p.id === captain.id);
      return entry?.contest_points || 0;
    }
    return captain?.points || 0;
  };

  const getViceCaptainPoints = () => {
    if (contestIdParam && contestData && viceCaptain) {
      const entry = contestData.players.find((p) => p.id === viceCaptain.id);
      return entry?.contest_points || 0;
    }
    return viceCaptain?.points || 0;
  };

  return (
    <Card className="p-4 sm:p-6 border-2 border-border-subtle hover:border-accent-pink-500/30 transition-all">
      {/* Header Section */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-start justify-between gap-3">
          {isEditing ? (
            <div className="flex-1 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                className="flex-1 px-3 py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Enter team name"
                maxLength={100}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onSaveRename}
                  disabled={renaming}
                  className="flex-1 sm:flex-none"
                >
                  {renaming ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancelRename}
                  disabled={renaming}
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Show TeamHeader in both views */}
              <TeamHeader
                teamName={team.team_name}
                createdAt={team.created_at}
                displayPoints={displayPoints}
                onClickRename={onStartRename}
                totalPoints={team.total_points}
                rank={team.rank || undefined}
                contestName={enrollment?.contestName}
                contestLink={
                  enrollment
                    ? `/contests/${enrollment.contestId}/leaderboard`
                    : undefined
                }
              />
              {/* View Toggle */}
              <ViewToggle
                currentView={viewMode}
                onViewChange={handleViewChange}
              />
            </>
          )}
        </div>

        {/* Enrollment success banner */}
        {enrollSuccess && (
          <div className="p-3 rounded bg-green-50 border border-green-200 text-green-800 text-sm">
            Joined{" "}
            <span className="font-semibold">{enrollSuccess.contestName}</span>.{" "}
            {enrollSuccess.contestId && (
              <a
                href={`/contests/${enrollSuccess.contestId}`}
                className="underline"
              >
                View contest
              </a>
            )}
          </div>
        )}

        {isEditing && (
          <ContestMetaBadges
            totalPoints={team.total_points}
            rank={team.rank || undefined}
            contestName={enrollment?.contestName}
            contestLink={
              enrollment
                ? `/contests/${enrollment.contestId}/leaderboard`
                : undefined
            }
          />
        )}
      </div>

      {/* View Content */}
      {viewMode === "pitch" ? (
        <PitchView
          team={team}
          players={pitchPlayers}
          enrollment={enrollment}
          onPlayerClick={onOpenPlayerActions}
        />
      ) : (
        <>
          {/* List View (existing) */}
          <h4 className="text-sm font-semibold text-[#E6E6FA] mb-3">
            Squad ({teamPlayers.length} players)
          </h4>

          {/* Captain & Vice Captain */}
          <div className="grid grid-cols-1 gap-3 mb-4">
            {captain && (
              <CaptainRow
                name={captain.name}
                team={captain.team}
                image={captain.image}
                roleLabel={roleToSlotLabel(captain.role || "")}
                gradientClassName={getRoleAvatarGradient(captain.role || "")}
                points={getCaptainPoints()}
              />
            )}

            {viceCaptain && (
              <ViceCaptainRow
                name={viceCaptain.name}
                team={viceCaptain.team}
                image={viceCaptain.image}
                roleLabel={roleToSlotLabel(viceCaptain.role || "")}
                gradientClassName={getRoleAvatarGradient(
                  viceCaptain.role || ""
                )}
                points={getViceCaptainPoints()}
              />
            )}
          </div>

          {/* Player List (exclude C/VC) */}
          <div>
            <SquadList
              teamId={team.id}
              players={teamPlayers as any}
              captainId={team.captain_id}
              viceCaptainId={team.vice_captain_id}
              contestPlayers={contestData ? contestData.players : undefined}
              getRoleAvatarGradient={getRoleAvatarGradient}
              roleToSlotLabel={roleToSlotLabel}
              onPlayerClick={(pid) => onOpenPlayerActions(pid)}
            />
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row justify-end gap-3 mt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenDelete}
          disabled={deleting}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 w-full sm:w-auto"
        >
          {deleting ? "Deleting..." : "Delete Team"}
        </Button>
      </div>
    </Card>
  );
}
