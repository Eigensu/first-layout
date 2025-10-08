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
        className={`${getBackgroundClass()} rounded-3xl p-6 transition-all duration-300 hover:shadow-xl relative overflow-hidden`}
      >
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary-200/30 to-transparent rounded-full -mr-16 -mt-16" />

        <div className="relative flex flex-col items-center text-center">
          {/* Rank badge */}
          <div className="mb-4">{getRankIcon(entry.rank)}</div>

          {/* Avatar */}
          <div className="relative mb-4">
            <Avatar name={entry.displayName} size="xl" />
            {entry.rank === 1 && (
              <div className="absolute -top-2 -right-2 bg-yellow-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg">
                1
              </div>
            )}
          </div>

          {/* User info */}
          <div className="mb-2">
            <h3 className="font-bold text-xl text-gray-900">
              {entry.displayName}
            </h3>
            <p className="text-sm text-gray-600">{entry.teamName}</p>
          </div>

          {/* Points */}
          <div className="mt-3">
            <p className="text-3xl font-bold text-primary-600">
              {entry.points.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">points</p>
          </div>

          {/* Rank change */}
          {getRankChangeIndicator(entry.rankChange)}
        </div>
      </div>
    );
  }

  // Standard leaderboard row
  return (
    <div
      className={`${getBackgroundClass()} rounded-2xl p-4 transition-all duration-300 hover:shadow-md flex items-center justify-between`}
    >
      <div className="flex items-center gap-4 flex-1">
        {/* Rank */}
        <div className="flex items-center justify-center w-12 h-12 bg-gray-50 rounded-full font-bold text-gray-700">
          {entry.rank <= 3 ? getRankIcon(entry.rank) : `#${entry.rank}`}
        </div>

        {/* Avatar and Info */}
        <div className="flex items-center gap-3 flex-1">
          <Avatar
            name={entry.displayName}
            size="md"
            className="flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 truncate">
              {entry.displayName}
            </h4>
            <p className="text-sm text-gray-600 truncate">{entry.teamName}</p>
          </div>
        </div>
      </div>

      {/* Right side: Points and rank change */}
      <div className="flex items-center gap-3">
        {getRankChangeIndicator(entry.rankChange)}

        <div className="text-right">
          <p className="text-2xl font-bold text-primary-600">
            {entry.points.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">points</p>
        </div>
      </div>
    </div>
  );
};
