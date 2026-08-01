"use client";

import React from "react";
import { Card, Button } from "@/components";
import { TeamHeader } from "@teamviewer/TeamHeader";
import { ContestMetaBadges } from "@teamviewer/molecules/ContestMetaBadges";
import { CaptainRow, ViceCaptainRow } from "@teamviewer/LeaderRow";
import { SquadList } from "@teamviewer/SquadList";

export interface TeamBasic {
  id: string;
  team_name: string;
  created_at: string | Date;
  player_ids: string[];
  captain_id?: string | null;
  vice_captain_id?: string | null;
  total_points?: number;
  rank?: number | null;
}

export interface PlayerBasic {
  id: string;
  name: string;
  team?: string;
  role?: string;
  image?: string;
  points?: number;
}

export interface ContestTeamData {
  contest_points: number;
  players: { id: string; contest_points: number }[];
}

export interface TeamEnrollmentMeta {
  contestId: string;
  contestName: string;
}

export interface TeamCardProps {
  team: TeamBasic;
  players: PlayerBasic[];
  contestIdParam?: string;
  contestData?: ContestTeamData;
  enrollment?: TeamEnrollmentMeta;
  enrollSuccess?: { contestId: string; contestName: string } | undefined;

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
}

export function TeamCard({
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
}: TeamCardProps) {
  const teamPlayers = players.filter((p) => team.player_ids.includes(p.id));
  const captain = players.find((p) => p.id === team.captain_id);
  const viceCaptain = players.find((p) => p.id === team.vice_captain_id);

  const displayPoints =
    contestIdParam && contestData
      ? contestData.contest_points || 0
      : team.total_points || 0;

  return (
    <Card className="p-4 sm:p-6 border-2 border-gray-200 hover:border-primary-300 transition-all hover:shadow-lg">
      {/* Header */}
      <div className="flex flex-col gap-2 mb-1">
        <div className="flex justify-between items-start gap-3">
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
                  className="flex-1 sm:flex-none text-text-main hover:bg-bg-card-soft"
                >
                  Cancel
                </Button>
              </div>

              {/* Enrollment success banner */}
              {enrollSuccess && (
                <div className="mb-3 p-3 rounded bg-green-50 border border-green-200 text-green-800 text-sm">
                  Joined{" "}
                  <span className="font-semibold">
                    {enrollSuccess.contestName}
                  </span>
                  . {""}
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
            </div>
          ) : (
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
          )}
        </div>

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

      {/* Squad Heading */}
      <h4 className="text-sm font-semibold text-text-main mb-3">
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
            points={(function () {
              if (contestIdParam && contestData) {
                const entry = contestData.players.find(
                  (p) => p.id === captain.id
                );
                return entry?.contest_points || 0;
              }
              return captain.points || 0;
            })()}
          />
        )}

        {viceCaptain && (
          <ViceCaptainRow
            name={viceCaptain.name}
            team={viceCaptain.team}
            image={viceCaptain.image}
            roleLabel={roleToSlotLabel(viceCaptain.role || "")}
            gradientClassName={getRoleAvatarGradient(viceCaptain.role || "")}
            points={(function () {
              if (contestIdParam && contestData) {
                const entry = contestData.players.find(
                  (p) => p.id === viceCaptain.id
                );
                return entry?.contest_points || 0;
              }
              return viceCaptain.points || 0;
            })()}
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

      {/* Actions */}
      <div className="flex flex-col sm:flex-row justify-end gap-3 mt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenDelete}
          disabled={deleting}
          className="text-danger hover:text-danger hover:bg-bg-card-soft w-full sm:w-auto"
        >
          {deleting ? "Deleting..." : "Delete Team"}
        </Button>
      </div>
    </Card>
  );
}
