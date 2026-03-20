"use client";

import { useEffect, useMemo, useState } from "react";
import type { Player } from "@/lib/api/admin/players";
import { playersApi } from "@/lib/api/admin/players";
import {
  adminContestsApi,
  type Contest,
  type PlayerPointsResponseItem,
} from "@/lib/api/admin/contests";
import { getErrorMessage } from "@/lib/api/client";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Loader2, AlertCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatPoints } from "@/lib/utils";
import { showToast } from "@/components/ui/Toast";

export function TeamsEditSection() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // inline editing: no modal
  const [teamFilter, setTeamFilter] = useState<string>("");
  // Map of contest-scoped points for selected contest: player_id -> points
  const [contestPointsMap, setContestPointsMap] = useState<
    Record<string, number>
  >({});
  const [contestPointsLoading, setContestPointsLoading] = useState(false);
  // Local edit text for smoother typing without fighting formatting
  const [editTextMap, setEditTextMap] = useState<Record<string, string>>({});

  // Contest selection state
  const [contests, setContests] = useState<Contest[]>([]);
  const [contestsLoading, setContestsLoading] = useState<boolean>(false);
  const [selectedContestId, setSelectedContestId] = useState<string>("");
  const selectedContest = useMemo(
    () => contests.find((c) => c.id === selectedContestId) || null,
    [contests, selectedContestId],
  );

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const pageSize = 100; // backend enforces le=100
      let page = 1;
      let total = Infinity;
      const all: Player[] = [];
      const seen = new Set<string>();

      while (all.length < total) {
        const res = await playersApi.getPlayers({ page, page_size: pageSize });
        total = res.total;
        for (const p of res.players) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            all.push(p);
          }
        }
        if (res.players.length < pageSize) break; // no more pages
        page += 1;
        // Safety cap to prevent infinite loops
        if (page > 1000) break;
      }

      setPlayers(all);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load contests for selection
    (async () => {
      try {
        setContestsLoading(true);
        const res = await adminContestsApi.list({ page_size: 50 });
        setContests(res.contests);
      } catch (e) {
        // Non-blocking: show as empty and allow retry via reload
      } finally {
        setContestsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    // Only load players after a contest is selected
    if (!selectedContestId) return;
    fetchAll();
    // Load per-contest player points for the selected contest
    (async () => {
      try {
        setContestPointsLoading(true);
        const res: PlayerPointsResponseItem[] =
          await adminContestsApi.getPlayerPoints(selectedContestId);
        const map: Record<string, number> = {};
        res.forEach((r) => {
          map[r.player_id] = r.points ?? 0;
        });
        setContestPointsMap(map);
        // initialize edit text map to formatted strings
        const text: Record<string, string> = {};
        Object.entries(map).forEach(([pid, val]) => {
          text[pid] = formatPoints(val);
        });
        setEditTextMap(text);
      } catch {
        setContestPointsMap({});
      } finally {
        setContestPointsLoading(false);
      }
    })();
  }, [selectedContestId]);

  const teams = useMemo(() => {
    const groups = new Map<string, Player[]>();
    for (const p of players) {
      const key = p.team || "Unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    // sort players by name within team
    Array.from(groups.values()).forEach((arr) =>
      arr.sort((a: Player, b: Player) => a.name.localeCompare(b.name)),
    );
    // sort team names
    let entries = Array.from(groups.entries()).sort(
      (a: [string, Player[]], b: [string, Player[]]) =>
        a[0].localeCompare(b[0]),
    );
    // If a daily contest with allowed_teams is selected, filter to those
    if (
      selectedContest &&
      selectedContest.contest_type === "daily" &&
      selectedContest.allowed_teams?.length
    ) {
      const allowed = new Set(
        selectedContest.allowed_teams.map((t) => (t || "").trim()),
      );
      entries = entries.filter(([teamName]) => allowed.has(teamName));
    }
    return entries;
  }, [players, selectedContest]);

  const visibleTeams = useMemo(() => {
    if (!teamFilter) return teams;
    return teams.filter(([name]) =>
      name.toLowerCase().includes(teamFilter.toLowerCase()),
    );
  }, [teams, teamFilter]);

  const saveTeamPoints = async (teamName: string, teamPlayers: Player[]) => {
    if (!selectedContestId) return;
    try {
      setContestPointsLoading(true);
      const updates = teamPlayers.map((p) => {
        const rawText =
          editTextMap[p.id] ?? formatPoints(contestPointsMap[p.id] ?? 0);
        const rawNum = Number(rawText);
        const normalized = Number(
          formatPoints(Number.isNaN(rawNum) ? 0 : rawNum),
        );
        return { player_id: p.id, points: normalized };
      });
      await adminContestsApi.upsertPlayerPoints(selectedContestId, { updates });
      // Refresh all contest points to reflect server state
      const res: PlayerPointsResponseItem[] =
        await adminContestsApi.getPlayerPoints(selectedContestId);
      const map: Record<string, number> = {};
      res.forEach((r) => {
        map[r.player_id] = r.points ?? 0;
      });
      setContestPointsMap(map);
      const text: Record<string, string> = {};
      Object.entries(map).forEach(([pid, val]) => {
        text[pid] = formatPoints(val);
      });
      setEditTextMap(text);
      showToast({
        title: "Saved",
        message: `${teamName} updated successfully`,
        variant: "success",
      });
    } catch (e) {
      // non-blocking, show inline error banner at top via setError if desired
    } finally {
      setContestPointsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 border-b space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-semibold text-text-main">
              Edit Players by Teams
            </h2>
          </div>
          {/* Contest selector */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-sm text-text-muted whitespace-nowrap">
                Select contest
              </label>
              <select
                value={selectedContestId}
                onChange={(e) => setSelectedContestId(e.target.value)}
                className="flex-1 sm:flex-none min-w-[220px] px-3 py-2 border border-border-subtle rounded-lg bg-bg-card text-text-main focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="" disabled>
                  {contestsLoading ? "Loading contests..." : "Choose a contest"}
                </option>
                {contests.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </option>
                ))}
              </select>
            </div>
            <input
              placeholder="Filter teams..."
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-full sm:w-64 px-3 py-2 border border-border-subtle rounded-lg bg-bg-card text-text-main placeholder:text-text-muted focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              disabled={!selectedContest}
            />
          </div>
          {selectedContest && (
            <div className="text-xs text-text-muted">
              <span className="font-medium">Contest:</span>{" "}
              {selectedContest.name} ·{" "}
              {new Date(selectedContest.start_at).toLocaleString()} →{" "}
              {new Date(selectedContest.end_at).toLocaleString()} ·{" "}
              {selectedContest.contest_type}
              {selectedContest.contest_type === "daily" &&
              selectedContest.allowed_teams?.length ? (
                <span>
                  {" "}
                  · Allowed Teams: {selectedContest.allowed_teams.length}
                </span>
              ) : null}
            </div>
          )}
        </CardHeader>
        <CardBody className="p-0">
          {!selectedContest ? (
            <div className="flex items-center justify-center py-12 text-text-muted">
              Please select a contest to edit player points by teams.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-600">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="divide-y">
              {visibleTeams.map(([teamName, teamPlayers]) => (
                <div key={teamName} className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <h3 className="text-base font-semibold text-text-main">
                      {teamName}
                    </h3>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-text-muted">
                        {teamPlayers.length} players
                      </span>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => saveTeamPoints(teamName, teamPlayers)}
                        disabled={!selectedContest || contestPointsLoading}
                      >
                        {contestPointsLoading ? "Saving..." : "Save Team"}
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-bg-elevated border-b border-border-subtle">
                        <tr>
                          <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                            Player
                          </th>
                          <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                            Points (3 decimals)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-bg-card divide-y divide-border-subtle">
                        {teamPlayers.map((p) => (
                          <tr key={p.id} className="hover:bg-bg-elevated/60">
                            <td className="px-3 sm:px-4 py-3 text-sm text-text-main">
                              {p.name}
                            </td>
                            <td className="px-3 sm:px-4 py-3 text-sm font-semibold text-text-main">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0.000"
                                value={
                                  editTextMap[p.id] ??
                                  formatPoints(contestPointsMap[p.id] ?? 0)
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditTextMap((prev) => ({
                                    ...prev,
                                    [p.id]: val,
                                  }));
                                }}
                                onBlur={(e) => {
                                  const raw = Number(e.target.value);
                                  const num = Number(
                                    formatPoints(Number.isNaN(raw) ? 0 : raw),
                                  );
                                  setContestPointsMap((prev) => ({
                                    ...prev,
                                    [p.id]: num,
                                  }));
                                  setEditTextMap((prev) => ({
                                    ...prev,
                                    [p.id]: formatPoints(num),
                                  }));
                                }}
                                className="w-28 sm:w-32 px-2 py-1 border border-border-subtle rounded-md bg-bg-card text-text-main placeholder:text-text-muted focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {visibleTeams.length === 0 && (
                <div className="text-center py-12 text-text-muted">
                  No teams match your filter.
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* No modal: inline editing with per-team save */}
    </div>
  );
}
