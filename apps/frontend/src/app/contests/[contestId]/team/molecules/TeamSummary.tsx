"use client";

import React from "react";
import { formatPoints } from "@/lib/utils";
import { Button, Card } from "@/components";
import { useRouter } from "next/navigation";

export interface TeamSummaryProps {
  contestId: string | undefined;
  team: {
    team_name: string;
    total_points: number;
  } | null;
  loadingTeam: boolean;
}

export function TeamSummary({
  contestId,
  team,
  loadingTeam,
}: TeamSummaryProps) {
  const router = useRouter();
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg sm:text-xl font-semibold text-text-main">
          Your Team
        </h3>
        <Button
          variant="ghost"
          onClick={() => router.push(`/contests/${contestId}`)}
          className="text-text-main hover:bg-bg-card-soft"
        >
          <span className="inline-flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M9.707 14.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L6.414 8H17a1 1 0 110 2H6.414l3.293 3.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
            Back
          </span>
        </Button>
      </div>
      {loadingTeam ? (
        <div className="text-text-muted">Loading your team...</div>
      ) : team ? (
        <Card className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="text-xs sm:text-sm text-text-muted">Team Name</div>
            <div className="text-base sm:text-lg font-semibold text-text-main truncate">
              {team.team_name}
            </div>
            <div className="text-xs sm:text-sm text-text-muted mt-1">
              Total Points:{" "}
              <span className="font-semibold text-success">
                {formatPoints(team.total_points)}
              </span>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="primary"
              className="w-full sm:w-auto"
              onClick={() =>
                router.push(
                  `/teams?contest_id=${encodeURIComponent(String(contestId || ""))}`
                )
              }
            >
              View Details
            </Button>
          </div>
        </Card>
      ) : (
        <div className="text-text-muted">No team found.</div>
      )}
    </>
  );
}
