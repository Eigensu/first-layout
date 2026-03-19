"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL, LS_KEYS } from "@/common/consts";
import { getUserTeams, type TeamResponse } from "@/lib/api/teams";
import {
  publicContestsApi,
  type Contest,
  type EnrollmentResponse,
} from "@/lib/api/public/contests";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";

type PastContestSummary = {
  contestId: string;
  contestName: string;
  contestStatus: Contest["status"];
  contestEndedAt: string;
  teamName: string;
  rank: number | null;
  points: number | null;
};

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user, isAuthenticated } = useAuth();
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamResponse[]>([]);
  const [pastContests, setPastContests] = useState<PastContestSummary[]>([]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const isPastContest = (contest: Contest) => {
    const ended = new Date(contest.end_at).getTime() < Date.now();
    return (
      contest.status === "completed" || contest.status === "archived" || ended
    );
  };

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const loadDashboardData = async () => {
      setIsLoadingData(true);
      setLoadError(null);

      try {
        const token = localStorage.getItem(LS_KEYS.ACCESS_TOKEN);
        if (!token) {
          throw new Error("Session expired. Please log in again.");
        }

        const [teamsRes, enrollmentsRes] = await Promise.all([
          getUserTeams(token),
          publicContestsApi
            .myEnrollments()
            .catch(() => [] as EnrollmentResponse[]),
        ]);

        setTeams(teamsRes.teams || []);

        if (!enrollmentsRes.length) {
          setPastContests([]);
          return;
        }

        const teamById = new Map(
          (teamsRes.teams || []).map((team) => [team.id, team]),
        );
        const enrollmentsByContest = enrollmentsRes.reduce<
          Record<string, EnrollmentResponse[]>
        >((acc, enrollment) => {
          if (!acc[enrollment.contest_id]) {
            acc[enrollment.contest_id] = [];
          }
          acc[enrollment.contest_id].push(enrollment);
          return acc;
        }, {});

        const contestRows = await Promise.all(
          Object.keys(enrollmentsByContest).map(async (contestId) => {
            let contest: Contest | null = null;

            try {
              contest = await publicContestsApi.getMe(contestId);
            } catch {
              try {
                contest = await publicContestsApi.get(contestId);
              } catch {
                contest = null;
              }
            }

            if (!contest || !isPastContest(contest)) {
              return null;
            }

            const selectedEnrollment = enrollmentsByContest[contestId][0];
            const selectedTeam = teamById.get(selectedEnrollment.team_id);

            let rank: number | null = null;
            let points: number | null = null;
            let fallbackTeamName = selectedTeam?.team_name || "Your Team";

            try {
              const leaderboard = await publicContestsApi.leaderboard(
                contestId,
                {
                  skip: 0,
                  limit: 1,
                },
              );
              rank = leaderboard.currentUserEntry?.rank ?? null;
              points = leaderboard.currentUserEntry?.points ?? null;
              fallbackTeamName =
                leaderboard.currentUserEntry?.teamName || fallbackTeamName;
            } catch {
              // Continue rendering with available enrollment/team data.
            }

            return {
              contestId,
              contestName: contest.name,
              contestStatus: contest.status,
              contestEndedAt: contest.end_at,
              teamName: fallbackTeamName,
              rank,
              points,
            } satisfies PastContestSummary;
          }),
        );

        const normalizedRows = contestRows
          .filter((row): row is PastContestSummary => !!row)
          .sort(
            (a, b) =>
              new Date(b.contestEndedAt).getTime() -
              new Date(a.contestEndedAt).getTime(),
          );

        setPastContests(normalizedRows);
      } catch (error: any) {
        setLoadError(error?.message || "Failed to load dashboard data");
      } finally {
        setIsLoadingData(false);
      }
    };

    loadDashboardData();
  }, [isAuthenticated, user]);

  const pastContestIdSet = useMemo(
    () => new Set(pastContests.map((item) => item.contestId)),
    [pastContests],
  );

  const pastTeams = useMemo(
    () =>
      teams.filter(
        (team) => team.contest_id && pastContestIdSet.has(team.contest_id),
      ),
    [teams, pastContestIdSet],
  );

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    if (password.length < 8) errors.push("at least 8 characters");
    if (!/[A-Z]/.test(password)) errors.push("one uppercase letter");
    if (!/[a-z]/.test(password)) errors.push("one lowercase letter");
    if (!/\d/.test(password)) errors.push("one number");
    return errors;
  };

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("All password fields are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password do not match.");
      return;
    }

    const passwordIssues = validatePassword(newPassword);
    if (passwordIssues.length > 0) {
      setPasswordError(
        `New password must contain ${passwordIssues.join(", ")}.`,
      );
      return;
    }

    const token = localStorage.getItem(LS_KEYS.ACCESS_TOKEN);
    if (!token) {
      setPasswordError("Session expired. Please log in again.");
      return;
    }

    try {
      setIsChangingPassword(true);
      const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail =
          typeof data?.detail === "string"
            ? data.detail
            : "Failed to change password. Please try again.";
        setPasswordError(detail);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password changed successfully.");
    } catch {
      setPasswordError("Network error while changing password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const profileRows = [
    { label: "User ID", value: user?.id || "-" },
    { label: "Username", value: user?.username || "-" },
    { label: "Email", value: user?.email || "-" },
    { label: "Full Name", value: user?.full_name || "-" },
    { label: "Mobile", value: user?.mobile || "-" },
    { label: "Role", value: user?.is_admin ? "Admin" : "Member" },
    { label: "Account Status", value: user?.is_active ? "Active" : "Inactive" },
    { label: "Member Since", value: formatDate(user?.created_at) },
    { label: "Avatar URL", value: user?.avatar_url || "-" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fff8ed] via-[#ecfeff] to-[#f8fafc]">
      <PillNavbar
        mobileMenuContent={isAuthenticated ? <MobileUserMenu /> : undefined}
      />
      <div className="h-20 md:h-24" />

      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pb-12 sm:pb-16">
        <div className="pointer-events-none absolute -top-8 right-0 h-28 w-28 rounded-full bg-amber-300/30 blur-2xl" />
        <div className="pointer-events-none absolute top-44 -left-8 h-28 w-28 rounded-full bg-cyan-300/30 blur-2xl" />

        <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/60 bg-white/80 backdrop-blur p-4 sm:p-8 shadow-xl shadow-amber-100/40 mb-4 sm:mb-6">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-amber-200/50" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-5">
            <div className="flex items-start sm:items-center gap-3 sm:gap-4">
              <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl overflow-hidden bg-white shadow-md ring-2 ring-white shrink-0">
                <Image
                  src="/logo.jpeg"
                  alt="Wall-E Arena Logo"
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Player Dashboard
                </p>
                <h1 className="text-xl sm:text-3xl font-black text-slate-900 leading-tight">
                  Welcome back, {user?.full_name || user?.username}
                </h1>
                <p className="mt-1 text-sm sm:text-base text-slate-600 max-w-xl">
                  Your complete account snapshot, teams history, and contest
                  performance.
                </p>
              </div>
            </div>

            <div className="sm:hidden grid grid-cols-3 gap-2 text-center">
              <div className="min-w-0 rounded-2xl bg-slate-900 text-white px-2 py-2">
                <div className="text-lg font-black leading-none">
                  {teams.length}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wide text-white/80 leading-tight">
                  Total Teams
                </div>
              </div>
              <div className="min-w-0 rounded-2xl bg-cyan-600 text-white px-2 py-2">
                <div className="text-lg font-black leading-none">
                  {pastTeams.length}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wide text-white/85 leading-tight">
                  Past Teams
                </div>
              </div>
              <div className="min-w-0 rounded-2xl bg-amber-500 text-slate-900 px-2 py-2">
                <div className="text-lg font-black leading-none">
                  {pastContests.length}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-800/80 leading-tight">
                  Past Contests
                </div>
              </div>
            </div>

            <div className="hidden sm:grid grid-cols-3 gap-2 sm:gap-3 text-center">
              <div className="rounded-2xl bg-slate-900 text-white px-3 py-2 sm:px-4 sm:py-3">
                <div className="text-lg sm:text-xl font-black">
                  {teams.length}
                </div>
                <div className="text-[11px] sm:text-xs uppercase tracking-wide text-white/80">
                  Total Teams
                </div>
              </div>
              <div className="rounded-2xl bg-cyan-600 text-white px-3 py-2 sm:px-4 sm:py-3">
                <div className="text-lg sm:text-xl font-black">
                  {pastTeams.length}
                </div>
                <div className="text-[11px] sm:text-xs uppercase tracking-wide text-white/85">
                  Past Teams
                </div>
              </div>
              <div className="rounded-2xl bg-amber-500 text-slate-900 px-3 py-2 sm:px-4 sm:py-3">
                <div className="text-lg sm:text-xl font-black">
                  {pastContests.length}
                </div>
                <div className="text-[11px] sm:text-xs uppercase tracking-wide text-slate-800/80">
                  Past Contests
                </div>
              </div>
            </div>
          </div>
        </section>

        {loadError && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            {loadError}
          </div>
        )}

        {isLoadingData ? (
          <div className="rounded-2xl sm:rounded-3xl border border-white/70 bg-white/85 shadow-lg p-6 sm:p-8 flex items-center justify-center gap-3 text-slate-700">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading your dashboard details...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6">
            <section className="xl:col-span-4 rounded-2xl sm:rounded-3xl border border-white/70 bg-white/85 shadow-lg p-4 sm:p-7">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2 mb-4 sm:mb-5">
                <ShieldCheck className="h-5 w-5 text-cyan-600" />
                Full Profile Data
              </h2>

              <div className="flex items-center gap-3 sm:gap-4 pb-4 sm:pb-5 mb-4 sm:mb-5 border-b border-slate-200">
                <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-2xl overflow-hidden bg-slate-200 flex items-center justify-center text-xl font-bold text-slate-700 shrink-0">
                  {user?.avatar_url ? (
                    <img
                      src={
                        user.avatar_url.startsWith("/api")
                          ? `${API_BASE_URL}${user.avatar_url}`
                          : user.avatar_url
                      }
                      alt={user?.username || "avatar"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{(user?.username?.[0] || "U").toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <p className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    {user?.full_name || user?.username}
                  </p>
                  <p className="text-xs sm:text-sm text-slate-600 break-all">
                    {user?.email}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 sm:space-y-3">
                {profileRows.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      {item.label}
                    </p>
                    <p className="text-xs sm:text-sm text-slate-900 break-all">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="xl:col-span-8 space-y-6">
              <div className="rounded-2xl sm:rounded-3xl border border-white/70 bg-white/85 shadow-lg p-4 sm:p-7">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2 mb-3 sm:mb-4">
                  <Users className="h-5 w-5 text-cyan-600" />
                  Past Teams
                </h2>

                {pastTeams.length === 0 ? (
                  <p className="text-slate-600">No past teams found yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
                    {pastTeams.map((team) => (
                      <article
                        key={team.id}
                        className="rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4"
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <p className="font-bold text-sm sm:text-base text-slate-900 leading-snug pr-1">
                            {team.team_name}
                          </p>
                          {typeof team.rank === "number" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-1 text-[11px] sm:text-xs font-semibold whitespace-nowrap">
                              <Crown className="h-3.5 w-3.5" />
                              Rank #{team.rank}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 text-slate-700 px-2 py-1 text-[11px] sm:text-xs font-medium whitespace-nowrap">
                              Rank N/A
                            </span>
                          )}
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] sm:text-xs">
                          <span className="rounded-full bg-cyan-100 text-cyan-800 px-2 py-1">
                            Points: {team.total_points}
                          </span>
                          <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                            Created: {formatDate(team.created_at)}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl sm:rounded-3xl border border-white/70 bg-white/85 shadow-lg p-4 sm:p-7">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2 mb-3 sm:mb-4">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Past Contests And Ranks
                </h2>

                {pastContests.length === 0 ? (
                  <p className="text-slate-600">
                    No past contest records found yet.
                  </p>
                ) : (
                  <div className="space-y-2.5 sm:space-y-3">
                    {pastContests.map((contest) => (
                      <article
                        key={`${contest.contestId}-${contest.teamName}`}
                        className="rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                          <div>
                            <p className="font-bold text-sm sm:text-base text-slate-900 leading-snug">
                              {contest.contestName}
                            </p>
                            <p className="text-xs sm:text-sm text-slate-600">
                              Team: {contest.teamName}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[11px] sm:text-xs">
                            <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                              {contest.contestStatus}
                            </span>
                            <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                              Ended: {formatDate(contest.contestEndedAt)}
                            </span>
                            <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-1 font-semibold">
                              Rank: {contest.rank ? `#${contest.rank}` : "N/A"}
                            </span>
                            <span className="rounded-full bg-cyan-100 text-cyan-800 px-2 py-1 font-semibold">
                              Points: {contest.points ?? "N/A"}
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl sm:rounded-3xl border border-white/70 bg-white/85 shadow-lg p-4 sm:p-7">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2 mb-3 sm:mb-4">
                  <KeyRound className="h-5 w-5 text-cyan-700" />
                  Security: Change Password
                </h2>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  {passwordError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs sm:text-sm text-rose-700">
                      {passwordError}
                    </div>
                  )}
                  {passwordSuccess && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs sm:text-sm text-emerald-700">
                      {passwordSuccess}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="block">
                      <span className="text-xs uppercase tracking-wide text-slate-600">
                        Current Password
                      </span>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        autoComplete="current-password"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs uppercase tracking-wide text-slate-600">
                        New Password
                      </span>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        autoComplete="new-password"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs uppercase tracking-wide text-slate-600">
                        Confirm Password
                      </span>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        autoComplete="new-password"
                      />
                    </label>
                  </div>

                  <div className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] sm:text-xs text-slate-700 leading-relaxed">
                    Password rules: at least 8 characters, one uppercase, one
                    lowercase, and one number.
                  </div>

                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isChangingPassword && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {isChangingPassword
                      ? "Updating Password..."
                      : "Update Password"}
                  </button>
                </form>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
