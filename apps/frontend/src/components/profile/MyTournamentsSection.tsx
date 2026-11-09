"use client";

import { Crown, ExternalLink, Globe } from "lucide-react";
import { currentTournamentSlug } from "@/common/consts";
import { getImageUrl } from "@/lib/utils";
import type { MyTournaments } from "@/lib/api/tournaments";
import {
  type AnyTournament,
  formatPoints,
  tournamentLink,
} from "./myTournaments";

const formatDate = (dateString?: string | null) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

function Logo({ tournament }: Readonly<{ tournament: AnyTournament }>) {
  return (
    <div className="h-11 w-11 rounded-xl overflow-hidden bg-bg-chip flex items-center justify-center text-base font-bold text-text-muted shrink-0">
      {tournament.logo_url ? (
        <img
          src={getImageUrl(tournament.logo_url)}
          alt={tournament.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{(tournament.name[0] || "T").toUpperCase()}</span>
      )}
    </div>
  );
}

function Name({
  tournament,
  here,
}: Readonly<{ tournament: AnyTournament; here: string | null }>) {
  const link = tournamentLink(tournament, here);
  if (!link) {
    return <>{tournament.name}</>;
  }
  return (
    <a
      href={link}
      className="inline-flex items-center gap-1 hover:text-accent-pink-soft hover:underline"
    >
      {tournament.name}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

/**
 * The profile's list of tournaments this account has joined. Renders nothing
 * when there are none, which is also what a single-tournament backend reports.
 */
export function MyTournamentsSection({
  tournaments,
  username,
}: Readonly<{
  tournaments: MyTournaments;
  username?: string;
}>) {
  const { played, registered_only } = tournaments;
  if (played.length === 0 && registered_only.length === 0) {
    return null;
  }
  const here = currentTournamentSlug();

  return (
    <div className="rounded-2xl sm:rounded-3xl border border-border-subtle bg-bg-card shadow-lg p-4 sm:p-7">
      <h2 className="text-lg sm:text-xl font-black text-text-main flex items-center gap-2 mb-1">
        <Globe className="h-5 w-5 text-accent-pink-500" />
        Your Tournaments
      </h2>
      <p className="text-xs sm:text-sm text-text-muted mb-3 sm:mb-4">
        One account for every Wall-E Arena tournament. Numbers can take a while
        to catch up while a tournament is live.
      </p>

      {played.length === 0 ? (
        <p className="text-text-muted">No tournaments played yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
          {played.map((tournament) => (
            <article
              key={tournament.slug}
              className="rounded-xl sm:rounded-2xl border border-border-subtle bg-bg-card-soft p-3.5 sm:p-4"
            >
              <div className="flex items-start gap-3">
                <Logo tournament={tournament} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-sm sm:text-base text-text-main leading-snug">
                      <Name tournament={tournament} here={here} />
                    </p>
                    {tournament.slug === here ? (
                      <span className="rounded-full bg-accent-pink-tonal text-accent-pink-soft px-2 py-1 text-[11px] font-semibold whitespace-nowrap">
                        This site
                      </span>
                    ) : (
                      <span className="rounded-full bg-bg-chip text-text-main px-2 py-1 text-[11px] font-medium whitespace-nowrap">
                        {tournament.status}
                      </span>
                    )}
                  </div>
                  {tournament.display_name !== username && (
                    <p className="text-xs text-text-muted">
                      Played as {tournament.display_name}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] sm:text-xs">
                <span className="rounded-full bg-bg-chip text-text-main px-2 py-1">
                  Teams: {tournament.teams_count}
                </span>
                <span className="rounded-full bg-bg-chip text-text-main px-2 py-1">
                  Contests: {tournament.contests_count}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-tonal text-warning px-2 py-1 font-semibold">
                  <Crown className="h-3.5 w-3.5" />
                  Best rank:{" "}
                  {tournament.best_rank ? `#${tournament.best_rank}` : "N/A"}
                </span>
                <span className="rounded-full bg-accent-pink-tonal text-accent-pink-soft px-2 py-1 font-semibold">
                  Points: {formatPoints(tournament.total_points)}
                </span>
                <span className="rounded-full bg-bg-chip text-text-main px-2 py-1">
                  Last played:{" "}
                  {formatDate(
                    tournament.last_active_at || tournament.joined_at,
                  )}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {registered_only.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-text-subtle mb-1.5">
            Also joined
          </p>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {registered_only.map((tournament) => (
              <span
                key={tournament.slug}
                className="rounded-full border border-border-subtle bg-bg-card-soft text-text-muted px-2.5 py-1"
              >
                <Name tournament={tournament} here={here} />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
