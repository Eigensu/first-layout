"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Trophy,
} from "lucide-react";
import { tournamentUrl, type TournamentStatus } from "@/common/consts";
import { getPublicTournaments, type PublicTournament } from "@/lib/api/tournaments";

// A draft is a tournament being set up; its subdomain already resolves, so it
// is shown as coming soon, as walle-landing showed UPCOMING.
const ORDER: Record<TournamentStatus, number> = {
  live: 0,
  draft: 1,
  completed: 2,
  archived: 3,
};

const BADGE: Record<TournamentStatus, { label: string; className: string }> = {
  live: { label: "LIVE NOW", className: "bg-success-tonal text-success" },
  draft: { label: "UPCOMING", className: "bg-accent-pink-tonal text-accent-pink-500" },
  completed: { label: "COMPLETED", className: "bg-bg-chip text-text-muted" },
  archived: { label: "ARCHIVED", className: "bg-bg-chip text-text-muted" },
};

function formatStart(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function sortTournaments(rows: PublicTournament[]): PublicTournament[] {
  return [...rows].sort((a, b) => {
    const byStatus = ORDER[a.status] - ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    const timeA = new Date(a.start_at ?? 0).getTime();
    const timeB = new Date(b.start_at ?? 0).getTime();
    // Most recent first among finished ones, soonest first otherwise.
    return a.status === "completed" ? timeB - timeA : timeA - timeB;
  });
}

export function TournamentCard({ tournament }: { tournament: PublicTournament }) {
  const badge = BADGE[tournament.status];
  const start = formatStart(tournament.start_at);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-bg-elevated border border-border-subtle hover:border-border-strong transition-all duration-300 hover:scale-[1.02] p-6 md:p-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-4 text-xs font-semibold tracking-wide ${badge.className}`}
          >
            {tournament.status === "live" && (
              <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
            )}
            {badge.label}
          </span>
          <h3 className="text-xl md:text-2xl font-bold text-text-main mb-3 leading-tight">
            {tournament.name}
          </h3>
          {start && (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Calendar className="w-4 h-4" />
              <span>{start}</span>
            </div>
          )}
        </div>

        <div className="w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-xl bg-bg-card p-2 flex items-center justify-center">
          {tournament.logo_url ? (
            // Logos live on any host an admin pastes, so next/image's host
            // allowlist would reject most of them.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tournament.logo_url}
              alt={`${tournament.name} logo`}
              className="w-full h-full object-contain"
            />
          ) : (
            <Trophy className="w-8 h-8 text-accent-pink-500" />
          )}
        </div>
      </div>

      <a
        href={tournamentUrl(tournament.slug)}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-button-primary text-text-main px-6 py-3 rounded-xl font-semibold text-sm transition-shadow hover:shadow-pink-soft"
      >
        Go to Tournament
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}

export function TournamentDirectory() {
  const [tournaments, setTournaments] = useState<PublicTournament[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicTournaments()
      .then((rows) => !cancelled && setTournaments(sortTournaments(rows)))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="flex justify-center py-20">
        <div className="bg-danger-tonal border border-danger-edge rounded-2xl p-8 max-w-md text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-danger" />
          <h3 className="text-lg font-semibold text-text-main mb-2">
            Unable to Load Tournaments
          </h3>
          <p className="text-text-muted text-sm">
            Please check your connection and try again.
          </p>
        </div>
      </div>
    );
  }

  if (!tournaments) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-muted">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-accent-pink-500" />
        <p>Loading tournaments...</p>
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="bg-bg-elevated border border-border-subtle rounded-2xl p-12 max-w-lg mx-auto">
          <Trophy className="w-12 h-12 mx-auto mb-4 text-accent-pink-500" />
          <h3 className="text-xl font-semibold text-text-main mb-2">
            No Active Tournaments
          </h3>
          <p className="text-text-muted">New tournaments are coming soon. Stay tuned!</p>
        </div>
      </div>
    );
  }

  const shown = tournaments.filter((t) => showCompleted || t.status !== "completed");
  const hasCompleted = tournaments.some((t) => t.status === "completed");

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {shown.length === 0 ? (
          <p className="col-span-full text-center py-10 text-text-muted">
            No tournaments found.
          </p>
        ) : (
          shown.map((t) => <TournamentCard key={t.slug} tournament={t} />)
        )}
      </div>

      {hasCompleted && (
        <div className="flex justify-center">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent-pink-tonal border border-accent-pink-edge hover:bg-accent-pink-tonal-hover text-text-muted hover:text-text-main font-medium transition-colors"
          >
            {showCompleted ? "Hide Completed Contests" : "Show Completed Contests"}
            {showCompleted ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      )}
    </>
  );
}
