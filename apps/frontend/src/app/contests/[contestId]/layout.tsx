"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import { useAuth } from "@/contexts/AuthContext";
import { publicContestsApi, type Contest } from "@/lib/api/public/contests";

export default function ContestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuth();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const contestId = Array.isArray((params as any)?.contestId)
    ? (params as any).contestId[0]
    : (params as any)?.contestId;

  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contestId) return;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const c = await publicContestsApi.get(contestId);
        setContest(c);
      } catch (e) {
        setError("Failed to load contest");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [contestId]);

  const tabHref = (tab: "leaderboard" | "team") =>
    `/contests/${contestId}/${tab}`;
  const teamsHref = `/teams?contest_id=${encodeURIComponent(String(contestId || ""))}`;
  const isActive = (tab: "leaderboard" | "team") =>
    pathname?.endsWith(`/${tab}`) ||
    (tab === "leaderboard" && pathname === `/contests/${contestId}`);
  const isHubIndex = pathname === `/contests/${contestId}`;
  const isLeaderboardRoute = pathname?.endsWith(`/leaderboard`);

  return (
    <div className="min-h-screen bg-bg-body">
      <PillNavbar
        activeId={
          pathname?.endsWith("/leaderboard") ? "leaderboard" : "contests"
        }
        mobileMenuContent={isAuthenticated ? <MobileUserMenu /> : undefined}
      />
      <div className="h-20" />

      <div className="px-3 sm:px-4 py-4 sm:py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header - hidden on hub index, leaderboard page, and team page */}
          {!isHubIndex &&
            !isLeaderboardRoute &&
            !pathname?.endsWith("/team") && (
              <div className="bg-bg-card/80 backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow p-4 sm:p-6 border border-border-subtle">
                {loading ? (
                  <div className="text-gray-500">Loading contest...</div>
                ) : error ? (
                  <div className="text-red-600">{error}</div>
                ) : contest ? (
                  <div className="flex flex-col gap-2 sm:gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <h1 className="text-xl sm:text-2xl font-bold text-text-main truncate">
                        {contest.name}
                      </h1>
                      <Link
                        href="/contests"
                        className="text-sm text-text-muted hover:text-text-main"
                      >
                        All Contests
                      </Link>
                    </div>
                    <div className="text-xs sm:text-sm text-text-muted">
                      {new Date(contest.start_at).toLocaleDateString()} -{" "}
                      {new Date(contest.end_at).toLocaleDateString()} •{" "}
                      <span className="uppercase">{contest.status}</span>
                    </div>
                    {contest.description && (
                      <p className="text-sm text-text-muted">
                        {contest.description}
                      </p>
                    )}

                    {/* Tabs */}
                    <div className="mt-2 sm:mt-4 border-t border-gray-100 pt-3 sm:pt-4">
                      <div className="flex gap-2">
                        <Link
                          href={tabHref("leaderboard")}
                          className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                            isActive("leaderboard")
                              ? "bg-gradient-brand text-white border-accent-pink-500 shadow"
                              : "bg-bg-card text-text-main border-border-subtle hover:bg-bg-card-soft"
                          }`}
                        >
                          Leaderboard
                        </Link>
                        <button
                          onClick={() => {
                            if (!isAuthenticated) {
                              router.push(
                                `/auth/login?next=${encodeURIComponent(teamsHref)}`
                              );
                            } else {
                              router.push(teamsHref);
                            }
                          }}
                          className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                            isActive("team")
                              ? "bg-gradient-brand text-white border-accent-pink-500 shadow"
                              : "bg-bg-card text-text-main border-border-subtle hover:bg-bg-card-soft"
                          }`}
                        >
                          Team
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

          {/* Outlet */}
          <div className="mt-4 sm:mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
