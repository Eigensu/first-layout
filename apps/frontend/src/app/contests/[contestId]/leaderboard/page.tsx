"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LeaderboardCard, LeaderboardSkeleton } from "@/components/leaderboard";
import { TeamDialog } from "@/components/leaderboard/TeamDialog";
import {
  publicContestsApi,
  type Contest,
  type LeaderboardResponse as ContestLeaderboardResponse,
} from "@/lib/api/public/contests";
import type { LeaderboardEntry as SharedLeaderboardEntry } from "@/types/leaderboard";
import { Trophy } from "lucide-react";

export default function ContestLeaderboardTabPage() {
  const params = useParams();
  const contestId = Array.isArray((params as any)?.contestId)
    ? (params as any).contestId[0]
    : (params as any)?.contestId;

  const [contest, setContest] = useState<Contest | null>(null);
  const [leaderboard, setLeaderboard] =
    useState<ContestLeaderboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!contestId) return;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const [c, lb] = await Promise.all([
          publicContestsApi.get(contestId),
          publicContestsApi.leaderboard(contestId),
        ]);
        setContest(c);
        setLeaderboard(lb);
      } catch (err) {
        console.error("Failed to load contest leaderboard", err);
        setError("Failed to load leaderboard. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [contestId]);

  return (
    <div className="min-h-screen bg-bg-body">
      <div className="py-4 sm:py-6">
        {/* Loading */}
        {isLoading && <LeaderboardSkeleton />}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Content */}
        {!isLoading && !error && leaderboard && (
          <div className="space-y-4 sm:space-y-8">
            {(() => {
              const entries: SharedLeaderboardEntry[] = leaderboard.entries.map(
                (e) => ({
                  rank: e.rank,
                  username: e.username,
                  displayName: e.displayName,
                  teamName: e.teamName,
                  points: e.points,
                  rankChange: e.rankChange ?? undefined,
                  avatarUrl: (e as any).avatarUrl ?? undefined,
                  teamId: (e as any).teamId ?? undefined,
                })
              );
              const currentUserEntry: SharedLeaderboardEntry | undefined =
                leaderboard.currentUserEntry
                  ? {
                      rank: leaderboard.currentUserEntry.rank,
                      username: leaderboard.currentUserEntry.username,
                      displayName: leaderboard.currentUserEntry.displayName,
                      teamName: leaderboard.currentUserEntry.teamName,
                      points: leaderboard.currentUserEntry.points,
                      rankChange:
                        leaderboard.currentUserEntry.rankChange ?? undefined,
                      avatarUrl:
                        (leaderboard.currentUserEntry as any).avatarUrl ??
                        undefined,
                      teamId:
                        (leaderboard.currentUserEntry as any).teamId ??
                        undefined,
                    }
                  : undefined;

              return (
                <div className="space-y-4 sm:space-y-8">
                  {/* Top 3 - Compact 2x2 layout on mobile */}
                  {entries.length >= 3 && (
                    <div className="mb-4 sm:mb-8">
                      {/* Mobile: 2x2 grid with 1st place on top */}
                      <div className="sm:hidden">
                        {/* First place - full width top row */}
                        <div className="mb-3">
                          <LeaderboardCard entry={entries[0]} showTopThree />
                        </div>
                        {/* Second and third place - side by side bottom row */}
                        <div className="grid grid-cols-2 gap-3">
                          <LeaderboardCard entry={entries[1]} showTopThree />
                          <LeaderboardCard entry={entries[2]} showTopThree />
                        </div>
                      </div>

                      {/* Desktop: Original 3-column podium layout */}
                      <div className="hidden sm:grid sm:grid-cols-3 gap-6">
                        <div className="order-1 mt-8">
                          <LeaderboardCard entry={entries[1]} showTopThree />
                        </div>
                        <div className="order-2">
                          <LeaderboardCard entry={entries[0]} showTopThree />
                        </div>
                        <div className="order-3 mt-8">
                          <LeaderboardCard entry={entries[2]} showTopThree />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Full list */}
                  <div className="bg-bg-card/80 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg">
                    <h2 className="text-xl sm:text-2xl font-bold text-text-main mb-4 sm:mb-6">
                      Complete Rankings
                    </h2>
                    <div className="space-y-2 sm:space-y-3">
                      {entries.map((entry) => (
                        <LeaderboardCard
                          key={entry.rank}
                          entry={entry}
                          isCurrentUser={
                            currentUserEntry?.username === entry.username
                          }
                          action={
                            entry.teamId &&
                            (contest?.status === "ongoing" ||
                              contest?.status === "completed") ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTeamId(entry.teamId!);
                                  setTeamDialogOpen(true);
                                }}
                                className="inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1.5 rounded-lg text-[10px] sm:text-sm font-medium border border-primary-200 text-primary-700 hover:bg-primary-50"
                              >
                                View Team
                              </button>
                            ) : null
                          }
                        />
                      ))}
                    </div>
                  </div>

                  {/* Current user pinned */}
                  {currentUserEntry && currentUserEntry.rank > 8 && (
                    <div className="bg-bg-card/80 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
                      <h3 className="text-base sm:text-lg font-semibold text-text-main mb-3 sm:mb-4">
                        Your Team
                      </h3>
                      <LeaderboardCard entry={currentUserEntry} isCurrentUser />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {!isLoading && !error && leaderboard?.entries.length === 0 && (
          <div className="bg-bg-card/80 rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center shadow-lg">
            <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-accent-pink mx-auto mb-3 sm:mb-4" />
            <h3 className="text-lg sm:text-xl font-semibold text-text-main mb-2">
              No Rankings Yet
            </h3>
            <p className="text-sm sm:text-base text-text-muted">
              Be the first to join and compete for the top spot!
            </p>
          </div>
        )}
      </div>
      <TeamDialog
        open={teamDialogOpen}
        contestId={String(contestId || "")}
        teamId={selectedTeamId || ""}
        onClose={() => setTeamDialogOpen(false)}
      />
    </div>
  );
}
