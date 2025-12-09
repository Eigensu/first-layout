"use client";

import { useEffect, useState } from "react";
import { Trophy, Star } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { useRouter } from "next/navigation";
import {
  publicContestsApi,
  Contest,
  type EnrollmentResponse,
} from "@/lib/api/public/contests";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import { useAuth } from "@/contexts/AuthContext";
import { ContestCard } from "@/components/home/ContestCard";

export default function ContestsPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinedContestIds, setJoinedContestIds] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // Fetch all public contests; we'll partition into Active vs Live
        const res = await publicContestsApi.list({ page_size: 100 });
        setContests(res.contests);
      } catch (e: any) {
        setError(e?.message || "Failed to load contests");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load user's contest enrollments to toggle Join/View Team
  useEffect(() => {
    (async () => {
      try {
        const mine: EnrollmentResponse[] =
          await publicContestsApi.myEnrollments();
        setJoinedContestIds(new Set(mine.map((e) => e.contest_id)));
      } catch {
        // ignore unauthenticated or unavailable endpoint
      }
    })();
  }, []);

  const handleJoin = (contestId: string) => {
    const target = `/contests/${contestId}/team`;
    if (!isAuthenticated) {
      router.push(`/auth/login?next=${encodeURIComponent(target)}`);
      return;
    }
    router.push(target);
  };

  // Partition contests using status values
  const activeContests = contests.filter((c) => c.status === "ongoing");
  const liveContests = contests
    .filter((c) => c.status === "live")
    .sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );

  return (
    <div className="min-h-screen bg-bg-body">
      <PillNavbar
        activeId="contests"
        mobileMenuContent={isAuthenticated ? <MobileUserMenu /> : undefined}
      />
      <div className="h-24" />

      <div className="max-w-4xl mx-auto px-3 sm:px-4 pt-1 sm:pt-0">
        <h1 className="flex items-center justify-center gap-2 sm:gap-3 text-2xl sm:text-3xl font-extrabold mb-6 sm:mb-8 text-center text-text-main">
          <Trophy className="w-7 h-7 text-accent-pink-500" />
          <span>Contests</span>
        </h1>
        {loading && (
          <div className="text-text-main">Getting your contests...</div>
        )}
        {error && <div className="text-red-600">{error}</div>}
        <div className="grid gap-4 sm:gap-5">
          {/* Active/Ongoing Contests */}
          {activeContests.map((c) => (
            <ContestCard
              key={c.id}
              contest={c}
              status="ongoing"
              isJoined={joinedContestIds.has(c.id)}
              isAuthenticated={isAuthenticated}
            />
          ))}

          {/* Live Contests */}
          {liveContests.map((c) => (
            <ContestCard
              key={c.id}
              contest={c}
              status="live"
              isJoined={joinedContestIds.has(c.id)}
              isAuthenticated={isAuthenticated}
            />
          ))}

          {!loading &&
            activeContests.length === 0 &&
            liveContests.length === 0 && (
              <EmptyState
                title="No contests available"
                description="There are currently no contests. Keep an eye on upcoming contests or explore other categories."
                icon={<Star className="w-10 h-10" />}
                primaryAction={{ label: "Explore Contests", href: "/contests" }}
              />
            )}
        </div>
      </div>
    </div>
  );
}
