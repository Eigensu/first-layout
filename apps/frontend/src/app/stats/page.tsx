"use client";

import { useSyncExternalStore } from "react";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import { Footer } from "@/components";
import { StatsView } from "@/components/stats/StatsView";
import { useTournamentStats } from "@/components/stats/useTournamentStats";
import { useAuth } from "@/contexts/AuthContext";
import { currentTournamentSlug } from "@/common/consts/tournament";

// The page's host does not change while it is open.
const noSubscription = () => () => {};

/**
 * The tournament's points table, MVP table and batting and bowling
 * leaderboards, from the backend's CricHeroes cache. Public: no sign-in.
 */
export default function StatsPage() {
  const { isAuthenticated } = useAuth();
  const { stats, reload } = useTournamentStats();
  // The host is only known in the browser. The server renders as if on a
  // tournament's site, which is where this page is linked from.
  const hasTournament = useSyncExternalStore(
    noSubscription,
    () => currentTournamentSlug() !== null,
    () => true
  );

  return (
    <div className="flex min-h-screen flex-col bg-bg-body">
      <PillNavbar
        activeId="stats"
        mobileMenuContent={isAuthenticated ? <MobileUserMenu /> : undefined}
      />
      {/* Clears the fixed navbar. */}
      <div className="h-20" />
      <div className="flex-1">
        <StatsView stats={stats} onRetry={reload} hasTournament={hasTournament} />
      </div>
      <Footer />
    </div>
  );
}
