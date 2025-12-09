"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useParams, useRouter } from "next/navigation";
import { formatISTRange } from "@/lib/utils";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  adminContestsApi,
  Contest,
  type PlayerPointsResponseItem,
} from "@/lib/api/admin/contests";
import {
  adminUsersApi,
  UsersWithTeamsResponse,
  AdminUserTeamsResponse,
} from "@/lib/api/admin/users";
import { publicContestsApi, LeaderboardEntry } from "@/lib/api/public/contests";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function AdminManageContestPage() {
  const params = useParams<{ contestId: string }>();
  const router = useRouter();
  const contestId = params?.contestId as string;

  const [contest, setContest] = useState<Contest | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-contest player points state
  const [playerPoints, setPlayerPoints] = useState<
    PlayerPointsResponseItem[] | null
  >(null);
  const [ppLoading, setPpLoading] = useState(false);
  const [ppSaving, setPpSaving] = useState(false);
  const [editedPoints, setEditedPoints] = useState<Record<string, string>>({}); // player_id -> string input

  // user search and selection
  const [search, setSearch] = useState("");
  const [userList, setUserList] = useState<UsersWithTeamsResponse | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userTeams, setUserTeams] = useState<AdminUserTeamsResponse | null>(
    null
  );
  const [selectedTeamIds, setSelectedTeamIds] = useState<
    Record<string, boolean>
  >({});
  const [enrolling, setEnrolling] = useState(false);
  // Schedule/status edit state - free time input (24h HH:MM)
  const [editStartDate, setEditStartDate] = useState<string>(""); // yyyy-MM-dd
  const [editStartTime, setEditStartTime] = useState<string>(""); // "HH:MM" 24h
  const [editEndDate, setEditEndDate] = useState<string>("");
  const [editEndTime, setEditEndTime] = useState<string>(""); // "HH:MM" 24h
  const [editStatus, setEditStatus] = useState<Contest["status"] | "">("");
  const [savingSchedule, setSavingSchedule] = useState(false);
  // Other settings edit state
  const [editVisibility, setEditVisibility] = useState<
    Contest["visibility"] | ""
  >("");
  const [editContestType, setEditContestType] = useState<
    Contest["contest_type"] | ""
  >("");
  const [editAllowedTeamsRaw, setEditAllowedTeamsRaw] = useState<string>(""); // comma separated for daily
  const [savingSettings, setSavingSettings] = useState(false);
  // General settings
  const [editName, setEditName] = useState<string>("");
  const [redirectAfterSave, setRedirectAfterSave] = useState(false);

  // No fixed steps; free time input via <input type="time">

  // Alert dialog state
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState<string | undefined>(undefined);
  const [alertMessage, setAlertMessage] = useState("");
  const showAlert = (message: string, title?: string) => {
    setAlertMessage(message);
    setAlertTitle(title);
    setAlertOpen(true);
  };

  // Parse server value to 24h parts without time math.
  // Accepts "YYYY-MM-DDTHH:MM:SS[...offset]" and returns { date: YYYY-MM-DD, time: HH:MM }
  const toFormParts = (value: string) => {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    if (!m) return { date: "", time: "00:00" };
    const date = m[1];
    const hh = m[2];
    const mm = m[3];
    return { date, time: `${hh}:${mm}` };
  };

  // Build naive ISO without timezone: YYYY-MM-DDTHH:MM:00 from 24h HH:MM
  const formToNaiveIso = (dateStr: string, hhmm24: string): string => {
    const [hourStr, minStr] = hhmm24.split(":");
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minStr, 10);
    const [year, month, day] = dateStr.split("-").map(Number);
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
    return iso;
  };

  const reseedFrom = (c: Contest) => {
    const start = toFormParts(c.start_at);
    const end = toFormParts(c.end_at);

    setEditStartDate(start.date);
    setEditStartTime(start.time);
    setEditEndDate(end.date);
    setEditEndTime(end.time);
    setEditStatus(c.status);
    setEditVisibility(c.visibility);
    setEditContestType(c.contest_type);
    setEditAllowedTeamsRaw((c.allowed_teams || []).join(", "));
    setEditName(c.name);
  };

  const saveAllSettings = async () => {
    if (!contest) return;
    // validate schedule first
    if (!editStartDate || !editStartTime || !editEndDate || !editEndTime) {
      showAlert("Start and End time are required", "Validation");
      return;
    }
    const startIso = formToNaiveIso(editStartDate, editStartTime);
    const endIso = formToNaiveIso(editEndDate, editEndTime);
    if (startIso >= endIso) {
      showAlert("Start time must be before End time", "Validation");
      return;
    }

    try {
      setSavingSettings(true);
      const payload: any = {
        start_at: startIso,
        end_at: endIso,
      };
      payload.status = editStatus || contest.status;
      if (editVisibility) payload.visibility = editVisibility;
      if (editContestType) payload.contest_type = editContestType;
      if (editContestType === "daily") {
        payload.allowed_teams = editAllowedTeamsRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      } else {
        payload.allowed_teams = [];
      }
      if (editName.trim()) payload.name = editName.trim();

      const updated = await adminContestsApi.update(contest.id, payload);

      setContest(updated);
      reseedFrom(updated);
      setRedirectAfterSave(true);
      showAlert("Contest settings saved", "Success");
    } catch (e: any) {
      showAlert(e?.message || "Failed to save settings", "Update failed");
    } finally {
      setSavingSettings(false);
    }
  };

  // Unenroll confirmation state
  const [showUnenrollDialog, setShowUnenrollDialog] = useState(false);
  const [unenrollTeamId, setUnenrollTeamId] = useState<string | null>(null);
  const [unenrolling, setUnenrolling] = useState(false);

  const loadContest = async () => {
    const c = await adminContestsApi.get(contestId);
    setContest(c);
    // seed schedule/status editors from server
    reseedFrom(c);
  };

  const [toggling, setToggling] = useState(false);
  const toggleContestStatus = async () => {
    if (!contest) return;
    const current = contest.status;
    const next = current === "ongoing" ? "live" : "ongoing";
    try {
      setToggling(true);
      const updated = await adminContestsApi.update(contest.id, {
        status: next,
      });
      setContest(updated);
      // Reload leaderboard state accordingly
      await loadLeaderboard();
    } catch (e: any) {
      showAlert(
        e?.message || "Failed to toggle contest status",
        "Update failed"
      );
    } finally {
      setToggling(false);
    }
  };

  const saveScheduleAndStatus = async () => {
    if (!contest) return;
    // Basic validation
    if (!editStartDate || !editStartTime || !editEndDate || !editEndTime) {
      showAlert("Start and End time are required", "Validation");
      return;
    }
    const startIso = formToNaiveIso(editStartDate, editStartTime);
    const endIso = formToNaiveIso(editEndDate, editEndTime);
    if (startIso >= endIso) {
      showAlert("Start time must be before End time", "Validation");
      return;
    }

    try {
      setSavingSchedule(true);
      const payload: any = { start_at: startIso, end_at: endIso };
      if (editStatus) payload.status = editStatus;
      const updated = await adminContestsApi.update(contest.id, payload);
      setContest(updated);
      reseedFrom(updated);
      // Refresh derived views
      await loadLeaderboard();
      showAlert("Contest schedule updated", "Success");
    } catch (e: any) {
      showAlert(e?.message || "Failed to update schedule", "Update failed");
    } finally {
      setSavingSchedule(false);
    }
  };

  const loadLeaderboard = async () => {
    try {
      const res = await publicContestsApi.leaderboard(contestId, {
        limit: 100,
      });
      setLeaderboard(res.entries);
    } catch {
      // If contest is private, public endpoint 404s; ignore leaderboard
      setLeaderboard([]);
    }
  };

  const loadPlayerPoints = async () => {
    if (!contestId) return;
    setPpLoading(true);
    try {
      const res = await adminContestsApi.getPlayerPoints(contestId);
      setPlayerPoints(res);
      // seed inputs with fetched values
      const map: Record<string, string> = {};
      res.forEach((r) => {
        map[r.player_id] = String(r.points ?? 0);
      });
      setEditedPoints(map);
    } catch {
      setPlayerPoints([]);
    } finally {
      setPpLoading(false);
    }
  };

  const savePlayerPoints = async () => {
    if (!contestId || !playerPoints) return;
    try {
      setPpSaving(true);
      const updates = playerPoints.map((p) => ({
        player_id: p.player_id,
        points: Number(editedPoints[p.player_id] ?? 0),
      }));
      await adminContestsApi.upsertPlayerPoints(contestId, { updates });
      await loadPlayerPoints();
    } catch (e: any) {
      showAlert(e?.message || "Failed to save player points", "Save failed");
    } finally {
      setPpSaving(false);
    }
  };

  const searchUsers = async () => {
    const res = await adminUsersApi.usersWithTeams({ search, page_size: 20 });
    setUserList(res);
  };

  const loadUserTeams = async (uid: string) => {
    const res = await adminUsersApi.getUserTeams(uid, {
      contest_id: contestId,
      page_size: 100,
    });
    setUserTeams(res);
    // pre-select not-enrolled teams? leave unchecked by default
    setSelectedTeamIds({});
  };

  const toggleTeam = (tid: string) => {
    setSelectedTeamIds((prev) => ({ ...prev, [tid]: !prev[tid] }));
  };

  const enrollSelected = async () => {
    const team_ids = Object.keys(selectedTeamIds).filter(
      (k) => selectedTeamIds[k]
    );
    if (team_ids.length === 0) {
      showAlert("Select at least one team", "Validation");
      return;
    }
    try {
      setEnrolling(true);
      await adminContestsApi.enrollTeams(contestId, { team_ids });
      await loadUserTeams(selectedUserId);
      await loadLeaderboard();
      showAlert("Enrolled successfully", "Success");
    } catch (e: any) {
      showAlert(e?.message || "Failed to enroll teams", "Enrollment failed");
    } finally {
      setEnrolling(false);
    }
  };

  const unenrollTeam = async (teamId: string) => {
    setUnenrollTeamId(teamId);
    setShowUnenrollDialog(true);
  };

  const confirmUnenroll = async () => {
    if (!unenrollTeamId) return;
    try {
      setUnenrolling(true);
      await adminContestsApi.unenroll(contestId, {
        team_ids: [unenrollTeamId],
      });
      await loadUserTeams(selectedUserId);
      await loadLeaderboard();
      setShowUnenrollDialog(false);
      setUnenrollTeamId(null);
    } catch (e: any) {
      showAlert(e?.message || "Failed to unenroll", "Unenroll failed");
    } finally {
      setUnenrolling(false);
    }
  };

  useEffect(() => {
    if (!contestId) return;
    (async () => {
      try {
        setLoading(true);
        await loadContest();
        await loadLeaderboard();
        await loadPlayerPoints();
      } catch (e: any) {
        setError(e?.message || "Failed to load contest");
      } finally {
        setLoading(false);
      }
    })();
  }, [contestId]);

  return (
    <ProtectedRoute>
      <div className="max-w-6xl mx-auto p-4 space-y-6 text-text-main">
        <AlertDialog
          open={alertOpen}
          title={alertTitle}
          message={alertMessage}
          onClose={() => {
            setAlertOpen(false);
            if (redirectAfterSave) {
              setRedirectAfterSave(false);
              router.push("/admin/contests");
            }
          }}
        />
        <ConfirmDialog
          open={showUnenrollDialog}
          title="Unenroll this team?"
          description="This will remove the team from this contest."
          cancelText="Cancel"
          confirmText={unenrolling ? "Unenrolling..." : "Unenroll"}
          destructive
          loading={unenrolling}
          onCancel={() => {
            if (!unenrolling) {
              setShowUnenrollDialog(false);
              setUnenrollTeamId(null);
            }
          }}
          onConfirm={confirmUnenroll}
        />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-main">
            Admin · Manage Contest
          </h1>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadContest}>
              Refresh
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push("/admin/contests")}
            >
              Back to Contests
            </Button>
          </div>
        </div>
        {loading && <div>Loading...</div>}
        {error && <div className="text-red-600">{error}</div>}

        {contest && (
          <div className="border border-border-subtle rounded p-4 bg-bg-card">
            <div className="text-xl font-medium text-text-main">
              {contest.name}
            </div>
            <div className="text-sm text-text-muted">
              {contest.code} · {contest.status} · {contest.visibility} ·{" "}
              {contest.contest_type}
            </div>
            <div className="mt-2">
              <button
                className={`px-3 py-1 rounded border text-sm ${contest.status === "ongoing" ? "text-success-200 border-success-200/60" : "text-accent-orange border-accent-orange/60"}`}
                onClick={toggleContestStatus}
                disabled={toggling}
                title="Toggle contest ON/OFF"
              >
                {toggling
                  ? "Toggling..."
                  : contest.status === "ongoing"
                    ? "Set Live (Open)"
                    : "Set Ongoing (Close)"}
              </button>
            </div>
            <div className="text-sm text-text-muted mt-1">
              <span>{formatISTRange(contest.start_at, contest.end_at)}</span>
            </div>
            {contest.description && (
              <p className="mt-2 text-text-muted">{contest.description}</p>
            )}
            {/* Unified Settings Card */}
            <Card className="mt-4 bg-bg-card border border-border-subtle text-text-main">
              <CardBody className="p-4">
                <div className="text-md font-medium mb-2 text-text-main">
                  Contest Settings
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-start">
                  <div className="flex flex-col md:col-span-3">
                    <label className="text-sm text-text-muted mb-1">Name</label>
                    <input
                      className="border border-border-subtle rounded p-2 w-full bg-bg-card text-text-main placeholder:text-text-muted"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-sm text-text-muted mb-1">
                      Start (IST)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        className="border border-border-subtle rounded p-2 w-[11rem] bg-bg-card text-text-main"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                      />
                      <input
                        type="time"
                        step={60}
                        className="border border-border-subtle rounded p-2 w-[8.5rem] bg-bg-card text-text-main"
                        value={editStartTime}
                        onChange={(e) => setEditStartTime(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-sm text-text-muted mb-1">
                      End (IST)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        className="border border-border-subtle rounded p-2 w-[11rem] bg-bg-card text-text-main"
                        value={editEndDate}
                        onChange={(e) => setEditEndDate(e.target.value)}
                      />
                      <input
                        type="time"
                        step={60}
                        className="border border-border-subtle rounded p-2 w-[8.5rem] bg-bg-card text-text-main"
                        value={editEndTime}
                        onChange={(e) => setEditEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-sm text-text-muted mb-1">
                      Status
                    </label>
                    <select
                      className="border border-border-subtle rounded p-2 bg-bg-card text-text-main"
                      value={editStatus || ""}
                      onChange={(e) =>
                        setEditStatus(e.target.value as Contest["status"])
                      }
                    >
                      <option value="">(no change)</option>
                      <option value="live">live</option>
                      <option value="ongoing">ongoing</option>
                      <option value="completed">completed</option>
                      <option value="archived">archived</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-sm text-text-muted mb-1">
                      Visibility
                    </label>
                    <select
                      className="border border-border-subtle rounded p-2 bg-bg-card text-text-main"
                      value={editVisibility || ""}
                      onChange={(e) =>
                        setEditVisibility(
                          e.target.value as Contest["visibility"]
                        )
                      }
                    >
                      <option value="">(no change)</option>
                      <option value="public">public</option>
                      <option value="private">private</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-sm text-text-muted mb-1">
                      Contest Type
                    </label>
                    <select
                      className="border border-border-subtle rounded p-2 bg-bg-card text-text-main"
                      value={editContestType || ""}
                      onChange={(e) =>
                        setEditContestType(
                          e.target.value as Contest["contest_type"]
                        )
                      }
                    >
                      <option value="">(no change)</option>
                      <option value="full">full</option>
                      <option value="daily">daily</option>
                    </select>
                  </div>

                  {(editContestType || contest?.contest_type) === "daily" && (
                    <div className="flex flex-col md:col-span-3">
                      <label className="text-sm text-text-muted mb-1">
                        Allowed Teams (comma separated)
                      </label>
                      <textarea
                        className="border border-border-subtle rounded p-2 min-h-[70px] bg-bg-card text-text-main placeholder:text-text-muted"
                        placeholder="e.g. Mumbai Indians, Chennai Super Kings"
                        value={editAllowedTeamsRaw}
                        onChange={(e) => setEditAllowedTeamsRaw(e.target.value)}
                      />
                      <p className="text-xs text-text-muted mt-1">
                        Only players whose team appears here will be eligible
                        for this daily contest.
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button disabled={savingSettings} onClick={saveAllSettings}>
                    {savingSettings ? "Saving..." : "Save All"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={savingSettings}
                    onClick={() => {
                      if (contest) reseedFrom(contest);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </CardBody>
            </Card>
            {contest.contest_type === "daily" && (
              <div className="mt-2 text-sm text-text-muted">
                <div className="font-medium text-text-main">Allowed Teams</div>
                <div className="text-text-muted">
                  {(contest.allowed_teams || []).length > 0
                    ? contest.allowed_teams.join(", ")
                    : "None"}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="border border-border-subtle rounded p-4 bg-bg-card text-text-main">
            <h2 className="text-lg font-medium mb-2 text-text-main">
              Leaderboard (Top 100)
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-border-subtle text-text-main">
                <thead>
                  <tr className="bg-bg-elevated text-left text-text-main">
                    <th className="p-2 border border-border-subtle">Rank</th>
                    <th className="p-2 border border-border-subtle">User</th>
                    <th className="p-2 border border-border-subtle">Team</th>
                    <th className="p-2 border border-border-subtle">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((e) => (
                    <tr
                      key={`${e.rank}-${e.username}`}
                      className="hover:bg-bg-elevated/60"
                    >
                      <td className="p-2 border border-border-subtle">
                        {e.rank}
                      </td>
                      <td className="p-2 border border-border-subtle">
                        {e.displayName}
                      </td>
                      <td className="p-2 border border-border-subtle">
                        {e.teamName}
                      </td>
                      <td className="p-2 border border-border-subtle">
                        {e.points.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {leaderboard.length === 0 && (
                    <tr>
                      <td
                        className="p-2 border border-border-subtle text-text-muted"
                        colSpan={4}
                      >
                        No entries yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="border border-border-subtle rounded p-4 bg-bg-card text-text-main">
            <h2 className="text-lg font-medium mb-2 text-text-main">
              Eligibility · Enroll Teams
            </h2>
            <div className="flex gap-2 mb-3">
              <input
                className="border border-border-subtle rounded p-2 flex-1 bg-bg-card text-text-main placeholder:text-text-muted"
                placeholder="Search users (username/full name)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className="px-3 py-2 rounded border border-border-subtle text-text-main hover:bg-bg-elevated"
                onClick={searchUsers}
              >
                Search
              </button>
            </div>

            {userList && (
              <div className="border border-border-subtle rounded divide-y divide-border-subtle mb-3 bg-bg-card">
                {userList.users.map((u) => (
                  <div
                    key={u.user_id}
                    className="p-2 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium text-text-main">
                        {u.username}
                      </div>
                      <div className="text-xs text-text-muted">
                        Teams: {u.team_count}
                      </div>
                    </div>
                    <button
                      className="px-3 py-1 rounded border border-border-subtle text-text-main hover:bg-bg-elevated"
                      onClick={() => {
                        setSelectedUserId(u.user_id);
                        loadUserTeams(u.user_id);
                      }}
                    >
                      Select
                    </button>
                  </div>
                ))}
                {userList.users.length === 0 && (
                  <div className="p-2 text-text-muted">No users found.</div>
                )}
              </div>
            )}

            {userTeams && (
              <div>
                <div className="mb-2 text-sm text-text-muted">
                  User: {userTeams.user.username}
                </div>
                <div className="border border-border-subtle rounded divide-y divide-border-subtle max-h-64 overflow-y-auto bg-bg-card">
                  {userTeams.teams.map((t) => (
                    <div
                      key={t.team_id}
                      className="p-2 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium text-text-main">
                          {t.team_name}
                        </div>
                        <div className="text-xs text-text-muted">
                          Points: {t.total_points}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.enrolled ? (
                          <button
                            className="px-3 py-1 rounded border border-border-subtle text-accent-orange"
                            onClick={() => unenrollTeam(t.team_id)}
                            disabled={contest?.status === "ongoing"}
                          >
                            Unenroll
                          </button>
                        ) : (
                          <input
                            type="checkbox"
                            checked={!!selectedTeamIds[t.team_id]}
                            onChange={() => toggleTeam(t.team_id)}
                            disabled={contest?.status === "ongoing"}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  {userTeams.teams.length === 0 && (
                    <div className="p-2 text-text-muted">
                      No teams for this user.
                    </div>
                  )}
                </div>
                <button
                  className="mt-3 px-4 py-2 rounded border border-border-subtle bg-bg-elevated text-text-main hover:bg-bg-card"
                  disabled={enrolling || contest?.status === "ongoing"}
                  onClick={enrollSelected}
                >
                  {contest?.status === "ongoing"
                    ? "Enrollment blocked (ongoing)"
                    : enrolling
                      ? "Enrolling..."
                      : "Enroll Selected Teams"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
