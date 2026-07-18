import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, Trophy, Users, ArrowRight } from "lucide-react";
import { API_BASE_URL } from "@/config/constants";
import type { TournamentStatus } from "@/common/consts/tournament";

export const dynamic = "force-dynamic";

interface PublicTournament {
  slug: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  status: TournamentStatus;
  start_at?: string | null;
  end_at?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  api_base_url?: string | null;
}

async function fetchTournament(slug: string): Promise<PublicTournament | null> {
  const res = await fetch(
    `${API_BASE_URL}/api/tournaments/by-slug/${encodeURIComponent(slug)}`,
    { cache: "no-store" }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load tournament (${res.status})`);
  return res.json();
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: "Coming Soon",
  live: "Live Now",
  completed: "Completed",
  archived: "Archived",
};

const STATUS_STYLES: Record<TournamentStatus, string> = {
  draft: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40",
  live: "bg-green-500/20 text-green-300 border border-green-500/40",
  completed: "bg-blue-500/20 text-blue-300 border border-blue-500/40",
  archived: "bg-gray-500/20 text-gray-300 border border-gray-500/40",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tournament = await fetchTournament(slug).catch(() => null);
  if (!tournament) return { title: "Tournament not found" };
  return {
    title: `${tournament.name} | Walle Arena`,
    description:
      tournament.description || `Fantasy cricket for ${tournament.name} on Walle Arena.`,
  };
}

export default async function TournamentLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tournament = await fetchTournament(slug);
  if (!tournament) notFound();

  const start = formatDate(tournament.start_at);
  const end = formatDate(tournament.end_at);
  const heroStyle =
    tournament.primary_color && tournament.secondary_color
      ? {
          background: `linear-gradient(120deg, ${tournament.primary_color} 0%, ${tournament.secondary_color} 100%)`,
        }
      : undefined;

  return (
    <div className="min-h-screen bg-bg-body text-text-main">
      <div
        className="relative overflow-hidden bg-gradient-hero"
        style={heroStyle}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center">
          {tournament.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tournament.logo_url}
              alt={`${tournament.name} logo`}
              className="mx-auto mb-6 h-24 w-24 rounded-2xl object-contain bg-white/10 p-2 shadow-lg"
            />
          )}
          <span
            className={`inline-block px-4 py-1 rounded-full text-sm font-medium mb-6 ${STATUS_STYLES[tournament.status]}`}
          >
            {STATUS_LABELS[tournament.status]}
          </span>
          <h1 className="text-4xl sm:text-6xl font-bold mb-4">
            {tournament.name}
          </h1>
          {tournament.description && (
            <p className="text-lg sm:text-xl text-text-muted max-w-2xl mx-auto mb-6">
              {tournament.description}
            </p>
          )}
          {(start || end) && (
            <div className="flex items-center justify-center gap-2 text-text-muted mb-10">
              <Calendar className="w-5 h-5" />
              <span>
                {start && end ? `${start} — ${end}` : start || end}
              </span>
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/contests"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-white text-purple-900 font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              <Trophy className="w-5 h-5" />
              View Contests
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl border border-white/40 text-white font-semibold hover:bg-white/10 transition-all"
            >
              <Users className="w-5 h-5" />
              Join &amp; Build Your Team
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          {
            icon: Users,
            title: "Pick Your XI",
            body: "Build your fantasy squad from the tournament's player pool.",
          },
          {
            icon: Trophy,
            title: "Join Contests",
            body: "Enter daily and full-tournament contests as the action unfolds.",
          },
          {
            icon: Calendar,
            title: "Climb the Leaderboard",
            body: "Score points from real performances and track your rank live.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-2xl bg-bg-card border border-border-subtle p-6 text-center"
          >
            <Icon className="w-8 h-8 mx-auto mb-3 text-accent-pink" />
            <h3 className="font-semibold text-lg mb-2">{title}</h3>
            <p className="text-sm text-text-muted">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
