"use client";

import React from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";
import { LeaderboardEntry } from "@/types/leaderboard";

interface LeaderboardCardProps {
  entry: LeaderboardEntry;
  isCurrentUser?: boolean;
  showTopThree?: boolean;
  action?: React.ReactNode;
}

export const LeaderboardCard: React.FC<LeaderboardCardProps> = ({
  entry,
  isCurrentUser = false,
  showTopThree = false,
  action,
}) => {
  const getRankBadge = (rank: number) => {
    const colors = {
      1: "text-[#FFD700]", // Gold
      2: "text-[#C0C0C0]", // Silver
      3: "text-[#CD7F32]", // Bronze
    };
    const color = colors[rank as keyof typeof colors] || "text-gray-700";
    return (
      <span className={`${color} font-extrabold text-2xl sm:text-3xl`}>
        {rank}
      </span>
    );
  };

  const getRankChangeIndicator = (change?: number) => {
    if (!change || change === 0) return null;

    if (change > 0) {
      return (
        <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full">
          <TrendingUp className="w-4 h-4" />
          <span className="text-xs font-medium">+{change}</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full">
          <TrendingDown className="w-4 h-4" />
          <span className="text-xs font-medium">{change}</span>
        </div>
      );
    }
  };

  const getBackgroundClass = () => {
    if (isCurrentUser) {
      return "bg-gradient-button-primary text-white border border-accent-pink-soft shadow-pink-soft";
    }
    if (entry.rank === 1) {
      return "bg-gradient-button-primary text-white border border-accent-pink-soft shadow-pink-soft";
    }
    return "bg-bg-card/70 text-text-main border border-border-subtle";
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Top 3 podium card style (larger, more prominent)
  if (showTopThree && entry.rank <= 3) {
    const containerClasses = (() => {
      // Borders per rank and subtle radial fill
      const base =
        "rounded-xl sm:rounded-2xl md:rounded-3xl transition-all duration-300 relative overflow-hidden text-text-main";
      if (entry.rank === 1)
        return `${base} sm:scale-100 border-2 border-accent-pink-soft bg-gradient-button-primary p-2 sm:p-5 md:p-6 hover:shadow-pink-strong`;
      if (entry.rank === 2)
        return `${base} sm:scale-95 border-2 border-accent-orange-soft bg-gradient-card p-1.5 sm:p-3 md:p-4 hover:shadow-pink-soft`;
      if (entry.rank === 3)
        return `${base} sm:scale-90 border-2 border-accent-orange-deep bg-gradient-brand p-1.5 sm:p-2 md:p-3 hover:shadow-pink-soft`;
      return `${base} bg-bg-card p-3 sm:p-4 hover:shadow-pink-soft`;
    })();
    return (
      <div className={containerClasses}>
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-br from-white/15 to-transparent rounded-full -mr-12 sm:-mr-16 -mt-12 sm:-mt-16" />

        <div className="relative flex flex-col items-center text-center">
          {/* Rank badge */}
          <div className="mb-1.5 sm:mb-3 md:mb-4">
            {getRankBadge(entry.rank)}
          </div>

          {/* Avatar */}
          <div className="relative mb-1.5 sm:mb-3 md:mb-4">
            <Avatar
              name={entry.displayName}
              src={entry.avatarUrl}
              size="md"
              className={
                entry.rank === 1
                  ? "w-12 h-12 sm:w-20 sm:h-20"
                  : entry.rank === 2
                    ? "w-10 h-10 sm:w-16 sm:h-16"
                    : "w-10 h-10 sm:w-14 sm:h-14"
              }
            />
            {/* Removed number badge for rank 1 as per request */}
          </div>

          {/* User info */}
          <div className="mb-1 sm:mb-2">
            <h3 className="font-bold text-sm sm:text-base md:text-xl text-text-main line-clamp-1">
              {entry.displayName}
            </h3>
            <p className="text-[10px] sm:text-xs md:text-sm text-text-muted line-clamp-1">
              {entry.teamName}
            </p>
          </div>

          {/* Optional action (e.g., View Team) */}
          {action && <div className="mt-0.5 sm:mt-1 md:mt-2">{action}</div>}

          {/* Points */}
          <div className="mt-1 sm:mt-2 md:mt-3">
            <p
              className={
                entry.rank === 1
                  ? "text-base sm:text-xl md:text-2xl lg:text-3xl font-bold text-text-main"
                  : entry.rank === 2
                    ? "text-sm sm:text-lg md:text-xl lg:text-2xl font-bold text-text-main"
                    : "text-sm sm:text-base md:text-lg lg:text-xl font-bold text-text-main"
              }
            >
              {entry.points.toLocaleString()}
            </p>
            <p className="text-[9px] sm:text-[10px] md:text-xs text-text-muted mt-0.5 sm:mt-1">
              points
            </p>
          </div>

          {/* Rank change */}
          <div className="mt-1 sm:mt-2">
            {getRankChangeIndicator(entry.rankChange)}
          </div>
        </div>
      </div>
    );
  }

  // Standard leaderboard row
  return (
    <div
      className={`${getBackgroundClass()} rounded-2xl p-3 sm:p-4 transition-all duration-300 hover:shadow-md`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Rank - Fixed width */}
        <div className="w-8 sm:w-10 flex-shrink-0 text-center">
          {entry.rank <= 3 ? (
            <span
              className={`font-extrabold text-base sm:text-lg ${
                entry.rank === 1
                  ? "text-[#FFD700]"
                  : entry.rank === 2
                    ? "text-[#C0C0C0]"
                    : "text-[#CD7F32]"
              }`}
            >
              {entry.rank}
            </span>
          ) : (
            <span className="font-bold text-sm sm:text-base text-gray-700">
              #{entry.rank}
            </span>
          )}
        </div>

        {/* Avatar - Fixed size */}
        <div className="flex-shrink-0">
          <Avatar name={entry.displayName} src={entry.avatarUrl} size="md" />
        </div>

        {/* User Info and Points - Flexible */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-semibold text-sm sm:text-base text-text-main truncate flex-1">
              {entry.displayName}
            </h4>
            <p className="text-sm sm:text-lg font-bold text-text-main flex-shrink-0">
              {entry.points.toLocaleString()}{" "}
              <span className="text-[10px] sm:text-xs text-text-muted font-normal">
                pts
              </span>
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-xs sm:text-sm text-text-muted truncate flex-1">
              {entry.teamName}
            </p>
            {action && <div className="flex-shrink-0">{action}</div>}
          </div>
        </div>
      </div>

      {/* Rank change indicator - show on small screens below */}
      {entry.rankChange !== undefined && entry.rankChange !== 0 && (
        <div className="sm:hidden mt-2 flex justify-end">
          {getRankChangeIndicator(entry.rankChange)}
        </div>
      )}
    </div>
  );
};
