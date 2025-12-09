"use client";

import React from "react";
import { Avatar } from "@/components";
import { formatPoints } from "@/lib/utils";

export interface SquadPlayerItem {
  id: string;
  name: string;
  team?: string;
  role?: string;
  image?: string;
  points?: number;
}

export interface ContestPlayerPoints {
  id: string;
  contest_points: number;
}

export interface SquadListProps {
  teamId: string;
  players: SquadPlayerItem[]; // full list of team players
  captainId?: string | null;
  viceCaptainId?: string | null;
  contestPlayers?: ContestPlayerPoints[]; // optional per-contest points to override display
  getRoleAvatarGradient: (role: string) => string | undefined;
  roleToSlotLabel: (role: string) => string;
  onPlayerClick: (playerId: string) => void;
}

export function SquadList({
  teamId,
  players,
  captainId,
  viceCaptainId,
  contestPlayers,
  getRoleAvatarGradient,
  roleToSlotLabel,
  onPlayerClick,
}: SquadListProps) {
  const excluded = new Set([captainId || "", viceCaptainId || ""]);
  const contestMap = new Map<string, number>(
    (contestPlayers || []).map((p) => [p.id, p.contest_points])
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {players
        .filter((p) => !excluded.has(p.id))
        .map((player) => {
          const points = contestMap.has(player.id)
            ? contestMap.get(player.id) || 0
            : player.points || 0;
          return (
            <div
              key={player.id}
              className="flex items-center gap-2 p-2 bg-bg-card rounded-lg hover:bg-bg-card-soft transition-colors cursor-pointer border border-border-subtle"
              onClick={() => onPlayerClick(player.id)}
            >
              <Avatar
                name={player.name}
                src={player.image}
                size="sm"
                gradientClassName={getRoleAvatarGradient(player.role || "")}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-text-main truncate">
                  {player.name}
                </p>
                <p className="text-xs text-text-muted truncate">
                  {player.team}
                </p>
              </div>
              <div className="text-right text-xs sm:text-sm font-medium text-success-400 whitespace-nowrap">
                {formatPoints(points)} pts
              </div>
            </div>
          );
        })}
    </div>
  );
}
