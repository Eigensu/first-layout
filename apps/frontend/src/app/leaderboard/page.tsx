"use client";

import React, { useEffect, useState } from "react";
import { LeaderboardCard, LeaderboardSkeleton } from "@/components/leaderboard";
import { PillNavbar, UserMenu, MobileUserMenu } from "@/components/navigation";
import { leaderboardApi } from "@/lib/api/leaderboard";
import { LeaderboardEntry, LeaderboardResponse } from "@/types/leaderboard";
import { Trophy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function LeaderboardPage() {
  const { isAuthenticated } = useAuth();
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
      <div className="pt-4 sm:pt-6 pb-3 sm:pb-4">
        <div className="max-w-7xl mx-auto px-2 sm:px-4">
          <div className="sm:block sm:relative">
            <PillNavbar
              activeId="leaderboard"
              mobileMenuContent={
                isAuthenticated ? <MobileUserMenu /> : undefined
              }
            />

            {/* Desktop: Show UserMenu absolutely positioned */}
            {isAuthenticated && (
              <div className="hidden sm:block absolute right-0 top-1/2 -translate-y-1/2">
                <UserMenu />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="py-4 sm:py-8 px-3 sm:px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-12">
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-primary-600" />
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">
                Global Leaderboard
              </h1>
            </div>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 px-4">
              See how you stack up against the best fantasy managers worldwide
            </p>
          </div>

          {/* Loading State */}
          {isLoading && <LeaderboardSkeleton />}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-center mx-2 sm:mx-0">
              <p className="text-sm sm:text-base text-red-600">{error}</p>
            </div>
          )}

          {/* Leaderboard Content */}
          {!isLoading && !error && leaderboardData && (
            <div className="space-y-4 sm:space-y-8">
              {/* Top 3 - Podium Display */}
              {leaderboardData.entries.length >= 3 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 mb-4 sm:mb-8">
                  {/* 2nd Place */}
                  <div className="sm:order-1 sm:mt-8">
                    <LeaderboardCard
                      entry={leaderboardData.entries[1]}
                      showTopThree
                    />
                  </div>

                  {/* 1st Place (Center, slightly elevated) */}
                  <div className="sm:order-2">
                    <LeaderboardCard
                      entry={leaderboardData.entries[0]}
                      showTopThree
                    />
                  </div>

                  {/* 3rd Place */}
                  <div className="sm:order-3 sm:mt-8">
                    <LeaderboardCard
                      entry={leaderboardData.entries[2]}
                      showTopThree
                    />
                  </div>
                </div>
              )}

              {/* Complete Rankings Section */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">
                  Complete Rankings
                </h2>

                <div className="space-y-2 sm:space-y-3">
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
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
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
            <div className="bg-white rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center shadow-lg mx-2 sm:mx-0">
              <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                No Rankings Yet
              </h3>
              <p className="text-sm sm:text-base text-gray-600">
                Be the first to join and compete for the top spot!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
