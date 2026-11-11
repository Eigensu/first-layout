"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { formatPoints } from "@/lib/utils";
import {
  ContestTeamResponse,
  publicContestsApi,
} from "@/lib/api/public/contests";

interface TeamDialogProps {
  open: boolean;
  contestId: string;
  teamId: string;
  onClose: () => void;
  /** When set, the header offers a link to this contest's leaderboard. */
  leaderboardHref?: string;
}

export const TeamDialog: React.FC<TeamDialogProps> = ({
  open,
  contestId,
  teamId,
  onClose,
  leaderboardHref,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<ContestTeamResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const resp = await publicContestsApi.teamInContest(contestId, teamId);
        if (!active) return;
        setTeam(resp);
      } catch (e: any) {
        const msg =
          e?.response?.data?.detail || e?.message || "Failed to load team";
        setError(String(msg));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [open, contestId, teamId]);

  if (!open) return null;

  const grouped = (() => {
    const map: Record<
      string,
      {
        name: string;
        id: string;
        team?: string | null;
        contest_points: number;
      }[]
    > = {};
    if (!team?.players) return map;
    for (const p of team.players) {
      const slot = (p.slot || "Others").toString();
      if (!map[slot]) map[slot] = [];
      map[slot].push({
        name: p.name,
        id: p.id,
        team: p.team,
        contest_points: p.contest_points,
      });
    }
    return map;
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-3 overflow-y-auto"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-6xl rounded-lg bg-white shadow-xl border border-primary-200 max-h-[95vh] overflow-hidden flex flex-col">
        <div className="p-2 sm:p-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-gray-900">
                {team?.team_name || "Team"}
              </h3>
              <p className="text-[10px] sm:text-xs text-gray-500">
                Points:{" "}
                {typeof team?.contest_points === "number"
                  ? formatPoints(team.contest_points)
                  : "-"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {leaderboardHref && (
                <Link
                  href={leaderboardHref}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white bg-gradient-brand hover:opacity-90 shadow"
                >
                  <Trophy className="h-3.5 w-3.5" />
                  View leaderboard
                </Link>
              )}
              <button
                onClick={onClose}
                className="px-2.5 py-1 rounded-full text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        <div className="p-2 sm:p-3 overflow-y-auto flex-1">
          {loading && <div className="text-gray-600">Loading team...</div>}
          {error && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && team && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {Object.entries(grouped).map(([slotKey, players], idx) => {
                const colors = [
                  {
                    border: "border-blue-200",
                    bg: "bg-blue-50",
                    text: "text-blue-700",
                  },
                  {
                    border: "border-amber-200",
                    bg: "bg-amber-50",
                    text: "text-amber-700",
                  },
                  {
                    border: "border-emerald-200",
                    bg: "bg-emerald-50",
                    text: "text-emerald-700",
                  },
                  {
                    border: "border-purple-200",
                    bg: "bg-purple-50",
                    text: "text-purple-700",
                  },
                ];
                const tone = colors[idx % colors.length];
                return (
                  <div
                    key={slotKey}
                    className={`rounded-md border ${tone.border} p-1.5 sm:p-2 ${tone.bg}`}
                  >
                    <div
                      className={`text-[11px] font-semibold mb-1 ${tone.text}`}
                    >
                      Slot {idx + 1}
                    </div>
                    <div className="space-y-0.5 leading-tight">
                      {players.map((p) => {
                        const isCaptain = team?.captain_id === p.id;
                        const isViceCaptain = team?.vice_captain_id === p.id;
                        const fontWeight =
                          isCaptain || isViceCaptain
                            ? "font-extrabold"
                            : "font-medium";

                        return (
                          <div key={p.id} className="text-[11px] leading-tight">
                            <div className="flex items-center justify-between gap-1">
                              <div
                                className={`${fontWeight} text-gray-900 truncate flex-1`}
                              >
                                {p.name}
                              </div>
                              <div
                                className={`text-[10px] ${fontWeight} text-primary-600 flex-shrink-0`}
                              >
                                {formatPoints(p.contest_points)}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {p.team && (
                                <div className="text-[10px] text-gray-500 truncate flex-1">
                                  {p.team}
                                </div>
                              )}
                              {isCaptain && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-primary-100 text-primary-700 border border-primary-400 font-bold flex-shrink-0">
                                  2X C
                                </span>
                              )}
                              {isViceCaptain && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-primary-100 text-primary-700 border border-primary-400 font-bold flex-shrink-0">
                                  1.5X VC
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
