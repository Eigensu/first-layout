"use client";

import React, { useEffect, useState } from "react";
import { LeaderboardCard, LeaderboardSkeleton } from "@/components/leaderboard";
import { PillNavbar } from "@/components/navigation";
import { leaderboardApi } from "@/lib/api/leaderboard";
import { LeaderboardEntry, LeaderboardResponse } from "@/types/leaderboard";
import { Trophy } from "lucide-react";

export default function LeaderboardPage() {
  const [leaderboardData, setLeaderboardData] =
    useState<LeaderboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await leaderboardApi.getLeaderboard();
        setLeaderboardData(data);
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
        setError("Failed to load leaderboard. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-primary-50 to-gray-50">
      {/* Navigation */}
      <div className="pt-6 pb-4">
        <PillNavbar activeId="leaderboard" />
      </div>

      <div className="py-8 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Trophy className="w-10 h-10 text-primary-600" />
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
                Global Leaderboard
              </h1>
            </div>
            <p className="text-lg text-gray-600">
              See how you stack up against the best fantasy managers worldwide
            </p>
          </div>

          {/* Loading State */}
          {isLoading && <LeaderboardSkeleton />}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* Leaderboard Content */}
          {!isLoading && !error && leaderboardData && (
            <div className="space-y-8">
              {/* Top 3 - Podium Display */}
              {leaderboardData.entries.length >= 3 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  {/* 2nd Place */}
                  <div className="md:order-1 md:mt-8">
                    <LeaderboardCard
                      entry={leaderboardData.entries[1]}
                      showTopThree
                    />
                  </div>

                  {/* 1st Place (Center, slightly elevated) */}
                  <div className="md:order-2">
                    <LeaderboardCard
                      entry={leaderboardData.entries[0]}
                      showTopThree
                    />
                  </div>

                  {/* 3rd Place */}
                  <div className="md:order-3 md:mt-8">
                    <LeaderboardCard
                      entry={leaderboardData.entries[2]}
                      showTopThree
                    />
                  </div>
                </div>
              )}

              {/* Complete Rankings Section */}
              <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 md:p-8 shadow-lg">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  Complete Rankings
                </h2>

                <div className="space-y-3">
                  {leaderboardData.entries.map((entry) => (
                    <LeaderboardCard
                      key={entry.rank}
                      entry={entry}
                      isCurrentUser={
                        leaderboardData.currentUserEntry?.username ===
                        entry.username
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Current User's Position (if not in top visible) */}
              {leaderboardData.currentUserEntry &&
                leaderboardData.currentUserEntry.rank > 8 && (
                  <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-lg">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Your Team
                    </h3>
                    <LeaderboardCard
                      entry={leaderboardData.currentUserEntry}
                      isCurrentUser
                    />
                  </div>
                )}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && leaderboardData?.entries.length === 0 && (
            <div className="bg-white rounded-3xl p-12 text-center shadow-lg">
              <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No Rankings Yet
              </h3>
              <p className="text-gray-600">
                Be the first to join and compete for the top spot!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
