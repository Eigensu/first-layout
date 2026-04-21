"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { PitchFormation } from "../molecules/PitchFormation";
import { SubstitutesBench } from "../molecules/SubstitutesBench";
import type { PitchPlayer, TeamBasic, TeamEnrollmentMeta } from "../types";

export interface PitchViewProps {
  team: TeamBasic;
  players: PitchPlayer[];
  enrollment?: TeamEnrollmentMeta;
  substitutes?: PitchPlayer[];
  onPlayerClick?: (playerId: string) => void;
  className?: string;
}

export function PitchView({
  team,
  players,
  enrollment,
  substitutes,
  onPlayerClick,
  className,
}: PitchViewProps) {
  // Filter main squad vs substitutes
  const mainSquad = players.filter((p) => !p.isSubstitute);
  const benchPlayers = substitutes || players.filter((p) => p.isSubstitute);

  return (
    <div className={cn("w-full rounded-2xl overflow-hidden", className)}>
      {/* Pitch Container */}
      <div className="relative p-1 md:p-4">
        {/* Inner pitch area - taller on mobile for better player distribution */}
        <div
          className={cn(
            "relative mx-auto",
            "w-full max-w-md",
            "aspect-[2/3]",
            "rounded-2xl md:rounded-3xl overflow-hidden",
            "border-2 md:border-4 border-primary-400/40"
          )}
          style={{
            backgroundImage: "url('/ground2.jfif')",
            backgroundSize: "100% 100%",
            backgroundPosition: "center",
          }}
        >
          {/* Subtle overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/10" />

          {/* Formation Grid - positioned over the pitch */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-full px-2 md:px-8 py-4 md:py-10">
              <PitchFormation
                players={mainSquad}
                captainId={team.captain_id}
                viceCaptainId={team.vice_captain_id}
                onPlayerClick={onPlayerClick}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Substitutes Bench */}
      {benchPlayers.length > 0 && (
        <SubstitutesBench
          substitutes={benchPlayers}
          onPlayerClick={onPlayerClick}
        />
      )}
    </div>
  );
}
