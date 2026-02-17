"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type Contest } from "@/lib/api/public/contests";
import { ROUTES } from "@/common/consts";

export type ContestCardStatus = "live" | "ongoing";

interface ContestCardProps {
  contest: Contest;
  status: ContestCardStatus;
  isJoined: boolean;
  isAuthenticated: boolean;
}

/**
 * Formats the time remaining until a given ISO date string in a human-readable format.
 */
function formatEndsIn(isoDate: string): string {
  const now = new Date().getTime();
  const end = new Date(isoDate).getTime();
  const diffMs = end - now;
  if (isNaN(end)) return "Ends soon";
  if (diffMs <= 0) return "Ended";

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days >= 1) return `Ends in ${days} day${days === 1 ? "" : "s"}`;
  if (hours >= 1) return `Ends in ${hours} hour${hours === 1 ? "" : "s"}`;
  return `Ends in ${Math.max(1, minutes)} min${minutes === 1 ? "" : "s"}`;
}

/**
 * Formats an ISO date string to IST (Indian Standard Time).
 */
function formatStartsAt(iso: string): string {
  const d = new Date(iso);
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + (5 * 60 + 30) * 60000);
  return ist.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * A reusable contest card component that handles both "live" and "ongoing" contest states.
 * Provides consistent styling, layout, and behavior across the application.
 */
export function ContestCard({
  contest,
  status,
  isJoined,
  isAuthenticated,
}: ContestCardProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/contests/${contest.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      router.push(`/contests/${contest.id}`);
    }
  };

  const renderTimeInfo = () => {
    if (status === "ongoing") {
      return formatEndsIn(contest.end_at);
    }
    return `Starts: ${formatStartsAt(contest.start_at)} IST`;
  };

  const renderActionButton = () => {
    if (status === "ongoing") {
      // Ongoing contest buttons
      if (isJoined) {
        return (
          <Link
            href={`/contests/${contest.id}/team`}
            className="inline-flex justify-center items-center px-4 py-2 rounded-lg border text-sm font-medium text-accent-pink-500 border-accent-pink-500/30 hover:bg-accent-pink-500/10"
            onClick={(e) => e.stopPropagation()}
          >
            View Team
          </Link>
        );
      }
      return (
        <Link
          href={`/contests/${contest.id}/leaderboard`}
          className="inline-flex justify-center items-center px-4 py-2 rounded-lg bg-gradient-button-secondary text-white text-sm font-medium shadow-md hover:opacity-90 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          View Leaderboard
        </Link>
      );
    }

    // Live contest buttons
    if (!isJoined) {
      if (isAuthenticated) {
        return (
          <Link
            href={`/contests/${contest.id}`}
            className="inline-flex justify-center items-center px-4 py-2 rounded-lg bg-bg-elevated text-white text-sm font-medium shadow-pink-soft hover:shadow-pink-strong transition-shadow"
            onClick={(e) => e.stopPropagation()}
          >
            Join Contest
          </Link>
        );
      }
      return (
        <Link
          href={`${ROUTES.LOGIN}?next=${encodeURIComponent(`/contests/${contest.id}/team`)}`}
          className="inline-flex justify-center items-center px-4 py-2 rounded-lg bg-bg-elevated text-white text-sm font-medium shadow-pink-soft hover:shadow-pink-strong transition-shadow"
          onClick={(e) => e.stopPropagation()}
        >
          Login to Join Contest
        </Link>
      );
    }

    return (
      <Link
        href={`/contests/${contest.id}/leaderboard`}
        className="inline-flex justify-center items-center px-4 py-2 rounded-lg bg-gradient-button-secondary text-white text-sm font-medium shadow-md hover:opacity-90 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        View Leaderboard
      </Link>
    );
  };

  const renderStatusBadge = () => {
    if (status === "ongoing") {
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse"></span>
          ONGOING
        </span>
      );
    }
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-green-600 animate-pulse"></span>
        LIVE
      </span>
    );
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="relative rounded-2xl p-5 cursor-pointer md:transition h-full overflow-hidden"
    >
      {/* Metallic gradient background */}
      <div className="absolute inset-0 bg-gradient-brand opacity-100" />

      {/* Content container */}
      <div className="relative z-10 h-full">
        <div className="flex justify-between h-full min-h-[150px]">
          {/* Left content */}
          <div className="min-w-0 flex flex-col justify-between h-full">
            <div>
              <h3 className="text-lg sm:text-xl font-semibold text-white drop-shadow-md break-words whitespace-normal overflow-visible hyphens-auto">
                {contest.name}
              </h3>
              {contest.description && (
                <p className="text-sm text-white/90 drop-shadow mt-0.5 line-clamp-2">
                  {contest.description}
                </p>
              )}
              <div className="text-xs text-white/80 drop-shadow mt-1">
                {renderTimeInfo()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {renderActionButton()}
            </div>
          </div>

          {/* Right content - badges and logo */}
          <div className="flex flex-col items-end justify-between shrink-0">
            <div className="flex items-center gap-2">
              {renderStatusBadge()}
              {isJoined && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                  Joined
                </span>
              )}
            </div>
            <Image
              src={contest.logo_url || "/Contests/logo.png"}
              alt={`${contest.name} logo`}
              width={120}
              height={32}
              className="w-[120px] h-auto object-contain opacity-90 drop-shadow"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
