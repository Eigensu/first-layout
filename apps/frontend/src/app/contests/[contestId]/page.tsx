"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart3, User, Crown } from "lucide-react";
import {
  publicContestsApi,
  Contest,
  type EnrollmentResponse,
} from "@/lib/api/public/contests";
import { PageLoader } from "@/components";

export default function ContestDetailsPage() {
  const { isAuthenticated } = useAuth();
  const params = useParams<{ contestId: string }>();
  const router = useRouter();
  const contestId = params?.contestId as string;
  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isJoined, setIsJoined] = useState(false);

  useEffect(() => {
    if (!contestId) return;
    (async () => {
      try {
        setLoading(true);
        const c = await publicContestsApi.get(contestId);
        setContest(c);
      } catch (e: any) {
        setError(e?.message || "Failed to load contest");
      } finally {
        setLoading(false);
      }
    })();
  }, [contestId]);

  // Check if user has already enrolled in this contest
  useEffect(() => {
    (async () => {
      try {
        const mine: EnrollmentResponse[] =
          await publicContestsApi.myEnrollments();
        setIsJoined(mine.some((e) => e.contest_id === contestId));
      } catch {
        // ignore unauthenticated or unavailable
      }
    })();
  }, [contestId]);

  return (
    <div className="max-w-7xl mx-auto p-4">
      {loading && (
        <PageLoader message="wallearena is getting your contest..." />
      )}
      {error && <div className="text-red-600">{error}</div>}
      {contest && (
        <>
          {/* Header: subtle badge + big gradient title */}
          {/* <div className="relative inline-block mb-0 -mt-24">
            <Crown className="w-8 h-8 text-primary-500/70 absolute -top-4 -left-6 hidden sm:block" />
            <Crown className="w-8 h-8 text-primary-500/70 absolute -top-4 -right-6 hidden sm:block" />
            <div className="text-4xl sm:text-4xl font-black tracking-tight bg-gradient-to-r from-primary-300 to-primary-700 bg-clip-text text-transparent px-4">
              Contests
            </div>
          </div> */}
          <div className="text-center mb-2 -mt-12">
            <div className="flex justify-center mt-0">
              <Image
                src="/lodha-park-cricket-league-season-2-sponsors/title-sponsor-2.png"
                alt="Title Sponsor"
                width={180}
                height={180}
                className="h-28 w-auto sm:h-40 object-contain"
                priority
              />
            </div>
            <div className="pt-0 mt-0 text-xs sm:text-sm font-semibold text-primary-700 tracking-wide">
              presents
            </div>
            <h1 className="mt-2 pb-2 sm:pb-3 text-2xl sm:text-4xl lg:text-3xl font-bold tracking-tight text-primary-700 leading-tight">
              {contest.name}
            </h1>
          </div>

          {/* Action cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-stretch">
            {/* Make/View team side (first) */}
            <button
              onClick={() => {
                const target = `/contests/${contest.id}/team`;
                if (!isAuthenticated) {
                  router.push(`/auth/login?next=${encodeURIComponent(target)}`);
                } else {
                  router.push(target);
                }
              }}
              className="w-full h-full rounded-3xl bg-gradient-to-br from-white via-primary-50 to-primary-100 shadow-lg hover:shadow-xl transition transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-primary/20"
            >
              <div className="p-6 sm:p-8 lg:p-10 flex flex-col items-center justify-center text-center min-h-[240px] sm:min-h-[280px] lg:min-h-[300px] h-full">
                <div className="mb-5 p-4 rounded-2xl bg-primary-100 inline-flex">
                  <User className="w-12 h-12 text-primary-700" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-primary-700">
                  {isJoined ? "View Team" : "Make Team"}
                </h2>
                <p className="mt-2 text-primary-700 text-sm sm:text-base">
                  {isJoined
                    ? "Open your registered team"
                    : "Assemble your squad and compete together"}
                </p>
                <div className="mt-6 inline-flex items-center px-6 py-2.5 rounded-full bg-gradient-primary text-white text-sm font-semibold shadow hover:shadow-lg transition">
                  {isJoined ? "Go to Team" : "Start Building"}
                </div>
              </div>
            </button>

            {/* Leaderboard side (second) */}
            <button
              onClick={() => router.push(`/contests/${contest.id}/leaderboard`)}
              className="group w-full h-full rounded-3xl overflow-hidden p-[2px] bg-gradient-primary shadow-lg transition transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-primary/40"
            >
              <div className="h-full w-full rounded-3xl bg-gradient-primary">
                <div className="p-6 sm:p-8 lg:p-10 text-white flex flex-col items-center justify-center text-center min-h-[240px] sm:min-h-[280px] lg:min-h-[300px] h-full">
                  <div className="mb-5 p-4 rounded-2xl bg-white/20 backdrop-blur-sm">
                    <BarChart3 className="w-12 h-12 text-white" />
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black tracking-tight drop-shadow">
                    Leaderboard
                  </h2>
                  <p className="mt-2 text-white/90 text-sm sm:text-base">
                    See how you rank against the best
                  </p>
                  <div className="mt-6 inline-flex items-center px-6 py-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white text-sm font-semibold transition">
                    View Rankings
                  </div>
                </div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
