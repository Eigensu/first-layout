"use client";

import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/common/consts";
import type { PitchPlayer } from "../types";
import { getSlotGradient, getInitials } from "../types";

export interface PitchPlayerCardProps {
  player: PitchPlayer;
  onClick?: (playerId: string) => void;
  showPoints?: boolean;
  size?: "sm" | "md" | "lg";
}

export function PitchPlayerCard({
  player,
  onClick,
  showPoints = true,
  size = "md",
}: PitchPlayerCardProps) {
  const sizeConfig = {
    sm: {
      container: "w-10 md:w-14",
      jersey: "w-8 h-9 md:w-10 md:h-12",
      badge: "w-3 h-3 md:w-4 md:h-4 text-[8px] md:text-[10px]",
      name: "text-[8px] md:text-[10px] max-w-[42px] md:max-w-[55px] px-0.5 md:px-1 py-0.5",
      points:
        "text-[8px] md:text-[10px] min-w-[24px] md:min-w-[28px] px-0.5 md:px-1 py-0.5",
    },
    md: {
      container: "w-12 md:w-20",
      jersey: "w-10 h-11 md:w-14 md:h-16",
      badge: "w-4 h-4 md:w-5 md:h-5 text-[9px] md:text-xs",
      name: "text-[9px] md:text-[11px] max-w-[50px] md:max-w-[75px] px-1 md:px-1.5 py-0.5",
      points:
        "text-[9px] md:text-[11px] min-w-[28px] md:min-w-[32px] px-1 md:px-1.5 py-0.5",
    },
    lg: {
      container: "w-16 md:w-24",
      jersey: "w-14 h-16 md:w-20 md:h-24",
      badge: "w-5 h-5 md:w-6 md:h-6 text-[10px] md:text-sm",
      name: "text-[10px] md:text-sm max-w-[65px] md:max-w-[100px] px-1 md:px-2 py-0.5 md:py-1",
      points:
        "text-[10px] md:text-sm min-w-[32px] md:min-w-[40px] px-1 md:px-2 py-0.5 md:py-1",
    },
  };

  const config = sizeConfig[size];

  // Normalize image URL - validate it has an actual filename
  const rawImageUrl = player.image;
  const isValidImageUrl =
    rawImageUrl &&
    rawImageUrl.length > 0 &&
    !rawImageUrl.endsWith("/") &&
    (rawImageUrl.includes(".jpg") ||
      rawImageUrl.includes(".jpeg") ||
      rawImageUrl.includes(".png") ||
      rawImageUrl.includes(".webp") ||
      rawImageUrl.includes(".gif"));

  const imageUrl = isValidImageUrl
    ? rawImageUrl.startsWith("http")
      ? rawImageUrl
      : `${API_BASE_URL}${rawImageUrl}`
    : undefined;

  return (
    <div
      className={cn(
        "flex flex-col items-center",
        "transition-all duration-200 hover:scale-110 hover:-translate-y-1",
        onClick && "cursor-pointer",
        config.container
      )}
      onClick={() => onClick?.(player.id)}
    >
      {/* Jersey/Avatar Container */}
      <div className={cn("relative", config.jersey)}>
        {/* Jersey/Avatar with shadow and border */}
        <div
          className={cn(
            "w-full h-full rounded-lg overflow-hidden",
            "shadow-lg border-2 border-white/30",
            "ring-2 ring-black/10",
            getSlotGradient(player.slot)
          )}
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={player.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 48px, 64px"
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gradient-to-b from-white/20 to-transparent">
              <span className="text-white font-bold text-sm md:text-base drop-shadow-md">
                {getInitials(player.name)}
              </span>
            </div>
          )}
        </div>

        {/* Captain/Vice-Captain Badge */}
        {(player.isCaptain || player.isViceCaptain) && (
          <div
            className={cn(
              "absolute -top-1.5 -right-1.5 z-10",
              config.badge,
              "rounded-full flex items-center justify-center font-bold",
              "shadow-lg border border-white/50",
              player.isCaptain
                ? "bg-gradient-to-br from-primary-400 to-primary-600 text-primary-900"
                : "bg-gradient-to-br from-accent-200 to-accent-400 text-accent-900"
            )}
          >
            {player.isCaptain ? "C" : "V"}
          </div>
        )}
      </div>

      {/* Name Badge - More compact */}
      <div
        className={cn(
          "-mt-1 bg-bg-elevated",
          "text-white font-semibold rounded shadow-md",
          "truncate text-center border border-border-subtle",
          config.name
        )}
        title={player.name}
      >
        {player.name.split(" ").pop() || player.name}
      </div>

      {/* Points Badge - Clean and modern */}
      {showPoints && (
        <div
          className={cn(
            "mt-0.5 font-bold rounded shadow text-center",
            config.points,
            player.points >= 0
              ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white"
              : "bg-gradient-to-r from-red-500 to-red-600 text-white"
          )}
        >
          {player.points} pts
        </div>
      )}
    </div>
  );
}
