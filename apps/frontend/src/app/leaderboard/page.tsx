"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, ChevronRight } from "lucide-react";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import { useAuth } from "@/contexts/AuthContext";
import { publicContestsApi, type Contest } from "@/lib/api/public/contests";

export default function LeaderboardIndexPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await publicContestsApi.list({ page_size: 100 });
        setContests(res.contests || []);
      } catch (e: any) {
        setError(e?.message || "Failed to load contests");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Compute pinned ordering and daily subset
  const { pinnedFull, dailyContests, orderedContests } = useMemo(() => {
    const full = contests.find((c) => c.contest_type === "full") || null;
    const daily = contests.filter((c) => c.contest_type === "daily");
    const rest = daily; // we only show daily after pin
    const ordered = full ? [full, ...rest] : rest;
    return { pinnedFull: full, dailyContests: daily, orderedContests: ordered };
  }, [contests]);

  // No inline leaderboard fetch on index; navigation only

  return (
    <div className="min-h-screen bg-bg-body">
      <PillNavbar
        activeId="leaderboard"
        mobileMenuContent={isAuthenticated ? <MobileUserMenu /> : undefined}
      />
      <div className="h-20" />

      <div className="max-w-5xl mx-auto p-4">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Trophy className="w-7 h-7 text-accent-pink-500" />
          <h1 className="text-3xl font-extrabold text-text-main">
            Leaderboard
          </h1>
        </div>

        {loading && <div className="text-text-main">Loading...</div>}
        {error && <div className="text-red-600">{error}</div>}

        {!loading && contests.length === 0 && (
          <div className="text-text-muted">No contests found.</div>
        )}

        {/* Pinned full contest (as navigable row) */}
        {pinnedFull && (
          <div className="mb-6">
            <button
              onClick={() =>
                router.push(`/contests/${pinnedFull.id}/leaderboard`)
              }
              className="w-full text-left rounded-2xl bg-gradient-brand px-5 py-4 shadow-pink-soft hover:shadow-pink-strong transition flex items-center justify-between border-2 border-accent-pink-soft"
            >
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white whitespace-normal break-words drop-shadow">
                    {pinnedFull.name}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      pinnedFull.status === "live"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : pinnedFull.status === "completed"
                          ? "bg-gray-50 text-gray-700 border-gray-200"
                          : pinnedFull.status === "archived"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}
                  >
                    {pinnedFull.status}
                  </span>
                </div>
                <p className="text-xs text-white/80 mt-1 drop-shadow">
                  {new Date(pinnedFull.start_at).toLocaleDateString()} -{" "}
                  {new Date(pinnedFull.end_at).toLocaleDateString()}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/70 flex-shrink-0" />
            </button>
          </div>
        )}

        {/* Daily contests list */}
        <div className="space-y-3">
          {dailyContests.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/contests/${c.id}/leaderboard`)}
              className="w-full text-left rounded-2xl bg-gradient-brand px-5 py-4 shadow-pink-soft hover:shadow-pink-strong transition flex items-center justify-between border-2 border-accent-pink-soft"
            >
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white whitespace-normal break-words drop-shadow">
                    {c.name}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      c.status === "live"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : c.status === "completed"
                          ? "bg-gray-50 text-gray-700 border-gray-200"
                          : c.status === "archived"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="text-xs text-white/80 mt-1 drop-shadow">
                  {new Date(c.start_at).toLocaleDateString()} -{" "}
                  {new Date(c.end_at).toLocaleDateString()}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/70 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
