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
import { LS_KEYS } from "@/common/consts";
import { authApi } from "@/lib/api/auth";
import { parseApiError } from "@/utils/errors";
import { getUserTeams, type TeamResponse } from "@/lib/api/teams";
import { getMyTournaments, type MyTournaments } from "@/lib/api/tournaments";
import { MyTournamentsSection } from "@/components/profile/MyTournamentsSection";
import { getImageUrl } from "@/lib/utils";
import {
  publicContestsApi,
  type Contest,
  type EnrollmentResponse,
} from "@/lib/api/public/contests";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import { ChangeEmailSection } from "@/components/profile/ChangeEmailSection";
import { getResetChannels } from "@/lib/api/emailCodes";

type PastContestSummary = {
  contestId: string;
  contestName: string;
  contestStatus: Contest["status"];
  contestEndedAt: string;
  teamName: string;
  rank: number | null;
  points: number | null;
};

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  );
}

function ProfileContent() {
  const { user, isAuthenticated, updateUser } = useAuth();
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamResponse[]>([]);
  const [pastContests, setPastContests] = useState<PastContestSummary[]>([]);
  const [myTournaments, setMyTournaments] = useState<MyTournaments | null>(
    null,
  );

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Changing the email needs the email channel; until this service has one,
  // the form stays hidden rather than failing on submit.
  const [emailChannel, setEmailChannel] = useState(false);
  useEffect(() => {
    let active = true;
    getResetChannels().then((channels) => {
      if (active) setEmailChannel(channels.email);
    });
    return () => {
      active = false;
    };
  }, []);

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

    const loadProfileData = async () => {
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
        setLoadError(error?.message || "Failed to load profile data");
      } finally {
        setIsLoadingData(false);
      }
    };

    loadProfileData();
  }, [isAuthenticated, user]);

  // Apart from the load above, so a slow /me/tournaments never holds the rest
  // of the profile behind its loading screen. A backend without memberships
  // (a single-tournament one, or one from before them) leaves the section out.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let active = true;
    getMyTournaments()
      .catch(() => null)
      .then((found) => {
        if (active) setMyTournaments(found);
      });
    return () => {
      active = false;
    };
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

    try {
      setIsChangingPassword(true);
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password changed successfully.");
    } catch (error) {
      setPasswordError(
        parseApiError(error, "Failed to change password. Please try again."),
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  const statTiles = [
    {
      label: "Total Teams",
      value: teams.length,
      className: "border border-border-subtle bg-bg-elevated text-text-main",
      labelClassName: "text-text-muted",
    },
    {
      label: "Past Teams",
      value: pastTeams.length,
      className: "bg-bg-chip text-text-main",
      labelClassName: "text-text-muted",
    },
    {
      label: "Past Contests",
      value: pastContests.length,
      className: "bg-gradient-brand text-white",
      labelClassName: "text-white/80",
    },
  ];

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
    <div className="min-h-screen bg-bg-body">
      <PillNavbar
        mobileMenuContent={isAuthenticated ? <MobileUserMenu /> : undefined}
      />
      <div className="h-20 md:h-24" />

      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pb-12 sm:pb-16">

        <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border-subtle bg-bg-card p-4 sm:p-8 shadow-lg mb-4 sm:mb-6">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-accent-pink-tonal" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-5">
            <div className="flex items-start sm:items-center gap-3 sm:gap-4">
              <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl overflow-hidden bg-bg-elevated shadow-md ring-2 ring-border-subtle shrink-0">
                <Image
                  src="/walle-logo.png"
                  alt="Wall-E Arena Logo"
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-subtle">
                  My Profile
                </p>
                <h1 className="text-xl sm:text-3xl font-black text-text-main leading-tight">
                  Welcome back, {user?.full_name || user?.username}
                </h1>
                <p className="mt-1 text-sm sm:text-base text-text-muted max-w-xl">
                  Your complete account snapshot, teams history, and contest
                  performance.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
              {statTiles.map((tile) => (
                <div
                  key={tile.label}
                  className={`min-w-0 rounded-2xl px-2 py-2 sm:px-4 sm:py-3 ${tile.className}`}
                >
                  <div className="text-lg sm:text-xl font-black leading-none sm:leading-normal">
                    {tile.value}
                  </div>
                  <div
                    className={`mt-1 sm:mt-0 text-[10px] sm:text-xs uppercase tracking-wide leading-tight ${tile.labelClassName}`}
                  >
                    {tile.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {loadError && (
          <div className="mb-6 rounded-2xl border border-danger-edge bg-danger-tonal px-4 py-3 text-danger">
            {loadError}
          </div>
        )}

        {isLoadingData ? (
          <div className="rounded-2xl sm:rounded-3xl border border-border-subtle bg-bg-card shadow-lg p-6 sm:p-8 flex items-center justify-center gap-3 text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading your profile details...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6">
            <section className="xl:col-span-4 rounded-2xl sm:rounded-3xl border border-border-subtle bg-bg-card shadow-lg p-4 sm:p-7">
              <h2 className="text-lg sm:text-xl font-black text-text-main flex items-center gap-2 mb-4 sm:mb-5">
                <ShieldCheck className="h-5 w-5 text-accent-pink-500" />
                Full Profile Data
              </h2>

              <div className="flex items-center gap-3 sm:gap-4 pb-4 sm:pb-5 mb-4 sm:mb-5 border-b border-border-subtle">
                <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-2xl overflow-hidden bg-bg-chip flex items-center justify-center text-xl font-bold text-text-muted shrink-0">
                  {user?.avatar_url ? (
                    <img
                      src={getImageUrl(user.avatar_url)}
                      alt={user?.username || "avatar"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{(user?.username?.[0] || "U").toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <p className="text-base sm:text-lg font-bold text-text-main leading-tight">
                    {user?.full_name || user?.username}
                  </p>
                  <p className="text-xs sm:text-sm text-text-muted break-all">
                    {user?.email}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 sm:space-y-3">
                {profileRows.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-border-subtle bg-bg-card-soft px-3 py-2"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-text-subtle">
                      {item.label}
                    </p>
                    <p className="text-xs sm:text-sm text-text-main break-all">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="xl:col-span-8 space-y-6">
              {myTournaments && (
                <MyTournamentsSection
                  tournaments={myTournaments}
                  username={user?.username}
                />
              )}

              <div className="rounded-2xl sm:rounded-3xl border border-border-subtle bg-bg-card shadow-lg p-4 sm:p-7">
                <h2 className="text-lg sm:text-xl font-black text-text-main flex items-center gap-2 mb-3 sm:mb-4">
                  <Users className="h-5 w-5 text-accent-pink-500" />
                  Past Teams
                </h2>

                {pastTeams.length === 0 ? (
                  <p className="text-text-muted">No past teams found yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
                    {pastTeams.map((team) => (
                      <article
                        key={team.id}
                        className="rounded-xl sm:rounded-2xl border border-border-subtle bg-bg-card-soft p-3.5 sm:p-4"
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <p className="font-bold text-sm sm:text-base text-text-main leading-snug pr-1">
                            {team.team_name}
                          </p>
                          {typeof team.rank === "number" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning-tonal text-warning px-2 py-1 text-[11px] sm:text-xs font-semibold whitespace-nowrap">
                              <Crown className="h-3.5 w-3.5" />
                              Rank #{team.rank}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-bg-chip text-text-main px-2 py-1 text-[11px] sm:text-xs font-medium whitespace-nowrap">
                              Rank N/A
                            </span>
                          )}
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] sm:text-xs">
                          <span className="rounded-full bg-accent-pink-tonal text-accent-pink-soft px-2 py-1">
                            Points: {team.total_points}
                          </span>
                          <span className="rounded-full bg-bg-chip text-text-main px-2 py-1">
                            Created: {formatDate(team.created_at)}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl sm:rounded-3xl border border-border-subtle bg-bg-card shadow-lg p-4 sm:p-7">
                <h2 className="text-lg sm:text-xl font-black text-text-main flex items-center gap-2 mb-3 sm:mb-4">
                  <Trophy className="h-5 w-5 text-warning" />
                  Past Contests And Ranks
                </h2>

                {pastContests.length === 0 ? (
                  <p className="text-text-muted">
                    No past contest records found yet.
                  </p>
                ) : (
                  <div className="space-y-2.5 sm:space-y-3">
                    {pastContests.map((contest) => (
                      <article
                        key={`${contest.contestId}-${contest.teamName}`}
                        className="rounded-xl sm:rounded-2xl border border-border-subtle bg-bg-card-soft p-3.5 sm:p-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                          <div>
                            <p className="font-bold text-sm sm:text-base text-text-main leading-snug">
                              {contest.contestName}
                            </p>
                            <p className="text-xs sm:text-sm text-text-muted">
                              Team: {contest.teamName}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[11px] sm:text-xs">
                            <span className="rounded-full bg-bg-chip text-text-main px-2 py-1">
                              {contest.contestStatus}
                            </span>
                            <span className="rounded-full bg-bg-chip text-text-main px-2 py-1">
                              Ended: {formatDate(contest.contestEndedAt)}
                            </span>
                            <span className="rounded-full bg-warning-tonal text-warning px-2 py-1 font-semibold">
                              Rank: {contest.rank ? `#${contest.rank}` : "N/A"}
                            </span>
                            <span className="rounded-full bg-accent-pink-tonal text-accent-pink-soft px-2 py-1 font-semibold">
                              Points: {contest.points ?? "N/A"}
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl sm:rounded-3xl border border-border-subtle bg-bg-card shadow-lg p-4 sm:p-7">
                <h2 className="text-lg sm:text-xl font-black text-text-main flex items-center gap-2 mb-3 sm:mb-4">
                  <KeyRound className="h-5 w-5 text-accent-pink-500" />
                  Security: Change Password
                </h2>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  {passwordError && (
                    <div className="rounded-xl border border-danger-edge bg-danger-tonal px-3 py-2 text-xs sm:text-sm text-danger">
                      {passwordError}
                    </div>
                  )}
                  {passwordSuccess && (
                    <div className="rounded-xl border border-success-edge bg-success-tonal px-3 py-2 text-xs sm:text-sm text-success">
                      {passwordSuccess}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="block">
                      <span className="text-xs uppercase tracking-wide text-text-muted">
                        Current Password
                      </span>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-border-subtle bg-bg-elevated px-3 py-2.5 text-sm text-text-main placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-accent-pink-500"
                        autoComplete="current-password"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs uppercase tracking-wide text-text-muted">
                        New Password
                      </span>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-border-subtle bg-bg-elevated px-3 py-2.5 text-sm text-text-main placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-accent-pink-500"
                        autoComplete="new-password"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs uppercase tracking-wide text-text-muted">
                        Confirm Password
                      </span>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-border-subtle bg-bg-elevated px-3 py-2.5 text-sm text-text-main placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-accent-pink-500"
                        autoComplete="new-password"
                      />
                    </label>
                  </div>

                  <div className="rounded-xl bg-bg-elevated px-3 py-2 text-[11px] sm:text-xs text-text-muted leading-relaxed">
                    Password rules: at least 8 characters, one uppercase, one
                    lowercase, and one number.
                  </div>

                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
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

              {emailChannel && (
                <ChangeEmailSection
                  currentEmail={user?.email}
                  authProvider={user?.auth_provider}
                  onChanged={updateUser}
                />
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
