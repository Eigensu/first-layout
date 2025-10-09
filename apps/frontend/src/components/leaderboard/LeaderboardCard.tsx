"use client";

import React from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Trophy, Medal, TrendingUp, TrendingDown } from "lucide-react";
import { LeaderboardEntry } from "@/types/leaderboard";

interface LeaderboardCardProps {
  entry: LeaderboardEntry;
  isCurrentUser?: boolean;
  showTopThree?: boolean;
}

export const LeaderboardCard: React.FC<LeaderboardCardProps> = ({
  entry,
  isCurrentUser = false,
  showTopThree = false,
}) => {
  const getRankIcon = (rank: number) => {
    if (rank === 1) {
      return <Trophy className="w-6 h-6 text-yellow-500" />;
    } else if (rank === 2) {
      return <Medal className="w-6 h-6 text-gray-400" />;
    } else if (rank === 3) {
      return <Medal className="w-6 h-6 text-amber-600" />;
    }
    return null;
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
      return "bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-500";
    }
    if (entry.rank === 1) {
      return "bg-gradient-to-r from-primary-100 to-primary-50 border-2 border-primary-400";
    }
    return "bg-white border border-gray-200";
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
    return (
      <div
        className={`${getBackgroundClass()} rounded-2xl sm:rounded-3xl p-4 sm:p-6 transition-all duration-300 hover:shadow-xl relative overflow-hidden`}
      >
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-br from-primary-200/30 to-transparent rounded-full -mr-12 sm:-mr-16 -mt-12 sm:-mt-16" />

        <div className="relative flex flex-col items-center text-center">
          {/* Rank badge */}
          <div className="mb-3 sm:mb-4">{getRankIcon(entry.rank)}</div>

          {/* Avatar */}
          <div className="relative mb-3 sm:mb-4">
            <Avatar
              name={entry.displayName}
              size="lg"
              className="sm:w-20 sm:h-20"
            />
            {entry.rank === 1 && (
              <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 bg-yellow-500 text-white rounded-full w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center text-xs sm:text-sm font-bold shadow-lg">
                1
              </div>
            )}
          </div>

          {/* User info */}
          <div className="mb-2">
            <h3 className="font-bold text-base sm:text-xl text-gray-900 line-clamp-1">
              {entry.displayName}
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 line-clamp-1">
              {entry.teamName}
            </p>
          </div>

          {/* Points */}
          <div className="mt-2 sm:mt-3">
            <p className="text-2xl sm:text-3xl font-bold text-primary-600">
              {entry.points.toLocaleString()}
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1">points</p>
          </div>

          {/* Rank change */}
          <div className="mt-2">{getRankChangeIndicator(entry.rankChange)}</div>
        </div>
      </div>
    );
  }

  // Standard leaderboard row
  return (
    <div
      className={`${getBackgroundClass()} rounded-2xl p-3 sm:p-4 transition-all duration-300 hover:shadow-md`}
    >
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Left side: Rank, Avatar, and Info */}
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
          {/* Rank */}
          <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gray-50 rounded-full font-bold text-gray-700 text-sm sm:text-base flex-shrink-0">
            {entry.rank <= 3 ? getRankIcon(entry.rank) : `#${entry.rank}`}
          </div>

          {/* Avatar and Info */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <Avatar
              name={entry.displayName}
              size="md"
              className="flex-shrink-0 hidden xs:block"
            />
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm sm:text-base text-gray-900 truncate">
                {entry.displayName}
              </h4>
              <p className="text-xs sm:text-sm text-gray-600 truncate">
                {entry.teamName}
              </p>
            </div>
          </div>
        </div>

        {/* Right side: Points and rank change */}
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Rank change indicator - hide on very small screens */}
          <div className="hidden sm:block">
            {getRankChangeIndicator(entry.rankChange)}
          </div>

          {/* Points */}
          <div className="text-right">
            <p className="text-lg sm:text-2xl font-bold text-primary-600 leading-tight">
              {entry.points.toLocaleString()}
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500">points</p>
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
