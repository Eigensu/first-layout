"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Crown,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";
import { LS_KEYS, currentTournamentSlug } from "@/common/consts";
import { authApi } from "@/lib/api/auth";
import { parseApiError } from "@/utils/errors";
import { getUserTeams } from "@/lib/api/teams";
import {
  getMyTournaments,
  type MyTournaments,
  type MyTournamentsTotals,
} from "@/lib/api/tournaments";
import { MyTournamentsSection } from "@/components/profile/MyTournamentsSection";
import { getImageUrl } from "@/lib/utils";
import {
  publicContestsApi,
  type Contest,
  type LeaderboardEntry,
} from "@/lib/api/public/contests";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import { ChangeEmailSection } from "@/components/profile/ChangeEmailSection";
import { getResetChannels } from "@/lib/api/emailCodes";
import { TeamDialog } from "@/components/leaderboard/TeamDialog";

// One of the user's contest entries in this tournament: a team entered in a
// contest. Keyed by the enrollment, not the team, because one team can be
// entered in several contests (a full contest and a daily one, say), and each
// entry has its own rank, points and leaderboard.
type ContestEntry = {
  enrollmentId: string;
  contestId: string;
  contestName: string;
  contestStatus: Contest["status"];
  // Only a public contest has a leaderboard to link to: the backend serves
  // neither the contest nor its leaderboard publicly when it is private.
  isPublic: boolean;
  startAt: string;
  endAt: string;
  isPast: boolean;
  teamId: string;
  teamName: string;
  teamCreatedAt: string | null;
  // The user's place in this contest. A user has one active team per contest
  // (uniq_active_user_per_contest), so the leaderboard's entry for the user is
  // this entry's team.
  rank: number | null;
  points: number | null;
};

// The team a card was tapped on, opened in the team popup.
type OpenTeam = { contestId: string; teamId: string; isPublic: boolean };

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
  const [entries, setEntries] = useState<ContestEntry[]>([]);
  const [openTeam, setOpenTeam] = useState<OpenTeam | null>(null);
  const [myTournaments, setMyTournaments] = useState<MyTournaments | null>(
    null,
  );
  const [myTournamentsFailed, setMyTournamentsFailed] = useState(false);
  // The tournament whose subdomain this is, once the backend has answered for
  // it; null on the main site and on a subdomain it does not know. Set after
  // mount: the server render has no host to read it from.
  const [tournamentSlug, setTournamentSlug] = useState<string | null>(null);
  // This tournament's own numbers, for when the account-wide ones are missing.
  const [localTotals, setLocalTotals] = useState<MyTournamentsTotals | null>(
    null,
  );
  const userId = user?.id;

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

  // Keyed on the account, not the user object: an email change replaces the
  // object, and none of this depends on the email.
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    let active = true;

    // Start from nothing on every run: a run for another account must not
    // inherit the previous one's tournament, entries or popup, whichever way
    // it ends.
    setTournamentSlug(null);
    setEntries([]);
    setLocalTotals(null);
    setOpenTeam(null);

    // Teams and enrollments belong to one tournament, and the backend reads
    // which from the subdomain. The main site names none, so there is nothing
    // to load there: the account-wide numbers come from /me/tournaments.
    const slug = currentTournamentSlug();
    if (!slug) {
      setIsLoadingData(false);
      return;
    }

    const loadProfileData = async () => {
      setIsLoadingData(true);
      setLoadError(null);

      try {
        const token = localStorage.getItem(LS_KEYS.ACCESS_TOKEN);
        if (!token) {
          throw new Error("Session expired. Please log in again.");
        }

        const [teamsResult, enrollmentsResult] = await Promise.allSettled([
          getUserTeams(token),
          publicContestsApi.myEnrollments(),
        ]);
        if (!active) return;

        // The backend refuses a slug it does not know (an archived tournament,
        // a mistyped subdomain) with a 400. There is no tournament here to show
        // history for, which is not an error on a profile.
        if (
          enrollmentsResult.status === "rejected" &&
          axios.isAxiosError(enrollmentsResult.reason) &&
          enrollmentsResult.reason.response?.status === 400
        ) {
          return;
        }
        if (teamsResult.status === "rejected") {
          throw teamsResult.reason;
        }
        setTournamentSlug(slug);

        const teams = teamsResult.value.teams || [];
        if (enrollmentsResult.status === "rejected") {
          return;
        }
        const enrollments = enrollmentsResult.value;
        const contestIds = Array.from(
          new Set(enrollments.map((e) => e.contest_id)),
        );
        setLocalTotals({
          tournaments_played: teams.length || contestIds.length ? 1 : 0,
          teams_count: teams.length,
          contests_count: contestIds.length,
        });

        const teamById = new Map(teams.map((team) => [team.id, team]));

        // Each contest once, however many of the user's teams are in it: its
        // details and the user's place on its leaderboard.
        const contestInfo = new Map(
          await Promise.all(
            contestIds.map(async (contestId) => {
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
              if (!contest) return [contestId, null] as const;

              let me: LeaderboardEntry | null = null;
              try {
                const leaderboard = await publicContestsApi.leaderboard(
                  contestId,
                  { skip: 0, limit: 1 },
                );
                me = leaderboard.currentUserEntry ?? null;
              } catch {
                // Show the entry without a rank rather than not at all.
              }
              return [contestId, { contest, me }] as const;
            }),
          ),
        );
        if (!active) return;

        const found: ContestEntry[] = [];
        for (const enrollment of enrollments) {
          const info = contestInfo.get(enrollment.contest_id);
          // A contest that could not be loaded has nothing to label the card
          // with or link to.
          if (!info) continue;
          const { contest, me } = info;
          const team = teamById.get(enrollment.team_id);
          found.push({
            enrollmentId: enrollment.id,
            contestId: enrollment.contest_id,
            contestName: contest.name,
            contestStatus: contest.status,
            isPublic: contest.visibility === "public",
            startAt: contest.start_at,
            endAt: contest.end_at,
            isPast: isPastContest(contest),
            teamId: enrollment.team_id,
            teamName: team?.team_name || me?.teamName || "Your Team",
            teamCreatedAt: team?.created_at ?? null,
            rank: me?.rank ?? null,
            points: me?.points ?? null,
          });
        }
        setEntries(found);
      } catch (error: any) {
        if (active) {
          setLoadError(error?.message || "Failed to load profile data");
        }
      } finally {
        if (active) setIsLoadingData(false);
      }
    };

    loadProfileData();
    return () => {
      active = false;
    };
  }, [isAuthenticated, userId]);

  // Apart from the load above, so a slow /me/tournaments never holds the rest
  // of the profile behind its loading screen. A backend without memberships
  // (a single-tournament one, or one from before them) leaves the section out.
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    let active = true;
    getMyTournaments()
      .then((found) => {
        if (active) setMyTournaments(found);
      })
      .catch(() => {
        if (active) setMyTournamentsFailed(true);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, userId]);

  // Entries still to come or running, soonest first; and finished ones, most
  // recently ended first. The past ones also fill "Past Contests And Ranks".
  const { currentEntries, pastEntries } = useMemo(() => {
    const byTime =
      (key: "startAt" | "endAt", dir: 1 | -1) =>
      (a: ContestEntry, b: ContestEntry) =>
        dir * (new Date(a[key]).getTime() - new Date(b[key]).getTime());
    return {
      currentEntries: entries
        .filter((e) => !e.isPast)
        .sort(byTime("startAt", 1)),
      pastEntries: entries.filter((e) => e.isPast).sort(byTime("endAt", -1)),
    };
  }, [entries]);

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

  // The header counts every tournament this account has played, from the same
  // source as the tournament cards; teams and enrollments above are only this
  // subdomain's. Where the account-wide numbers are missing (the request
  // failed, or a single-tournament backend, which keeps no memberships) this
  // tournament's own are the best there is. A dash while waiting, and where
  // there is nothing at all, rather than a misleading 0.
  const accountTotals = myTournaments
    ? (myTournaments.totals ?? sumPlayed(myTournaments))
    : null;
  let headerTotals: MyTournamentsTotals | null = null;
  if (myTournaments || myTournamentsFailed) {
    headerTotals =
      accountTotals && (accountTotals.tournaments_played > 0 || !localTotals)
        ? accountTotals
        : localTotals;
  }
  const accountStat = (pick: (t: MyTournamentsTotals) => number) =>
    headerTotals ? pick(headerTotals) : "–";
  const statTiles = [
    {
      label: "Total Teams",
      value: accountStat((t) => t.teams_count),
      className: "border border-border-subtle bg-bg-elevated text-text-main",
      labelClassName: "text-text-muted",
    },
    {
      label: "Tournaments",
      value: accountStat((t) => t.tournaments_played),
      className: "bg-bg-chip text-text-main",
      labelClassName: "text-text-muted",
    },
    {
      label: "Contests",
      value: accountStat((t) => t.contests_count),
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

              {/* Per-tournament history, so only on a tournament's own site. */}
              {tournamentSlug && (
                <>
                  <TeamsSection
                    title="Current Teams In This Tournament"
                    emptyText="No teams in upcoming or live contests."
                    entries={currentEntries}
                    formatDate={formatDate}
                    onOpen={setOpenTeam}
                  />

                  <TeamsSection
                    title="Past Teams In This Tournament"
                    emptyText="No past teams found yet."
                    entries={pastEntries}
                    formatDate={formatDate}
                    onOpen={setOpenTeam}
                  />

                  <div className="rounded-2xl sm:rounded-3xl border border-border-subtle bg-bg-card shadow-lg p-4 sm:p-7">
                    <h2 className="text-lg sm:text-xl font-black text-text-main flex items-center gap-2 mb-3 sm:mb-4">
                      <Trophy className="h-5 w-5 text-warning" />
                      Past Contests And Ranks In This Tournament
                    </h2>

                    {pastEntries.length === 0 ? (
                      <p className="text-text-muted">
                        No past contest records found yet.
                      </p>
                    ) : (
                      <div className="space-y-2.5 sm:space-y-3">
                        {pastEntries.map((contest) => {
                          const row = (
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
                                  Ended: {formatDate(contest.endAt)}
                                </span>
                                <span className="rounded-full bg-warning-tonal text-warning px-2 py-1 font-semibold">
                                  Rank:{" "}
                                  {contest.rank ? `#${contest.rank}` : "N/A"}
                                </span>
                                <span className="rounded-full bg-accent-pink-tonal text-accent-pink-soft px-2 py-1 font-semibold">
                                  Points: {contest.points ?? "N/A"}
                                </span>
                                {contest.isPublic && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-bg-chip text-text-main px-2 py-1 font-semibold">
                                    Leaderboard
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                          // A private contest's leaderboard is not served to
                          // anyone, its players included, so there is
                          // nothing to link to.
                          return contest.isPublic ? (
                            <Link
                              key={contest.enrollmentId}
                              href={myLeaderboardHref(contest.contestId)}
                              className="block rounded-xl sm:rounded-2xl border border-border-subtle bg-bg-card-soft p-3.5 sm:p-4 transition hover:border-accent-pink-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink-500"
                            >
                              {row}
                            </Link>
                          ) : (
                            <article
                              key={contest.enrollmentId}
                              className="rounded-xl sm:rounded-2xl border border-border-subtle bg-bg-card-soft p-3.5 sm:p-4"
                            >
                              {row}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

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

      {openTeam && (
        <TeamDialog
          open
          contestId={openTeam.contestId}
          teamId={openTeam.teamId}
          leaderboardHref={
            openTeam.isPublic
              ? myLeaderboardHref(openTeam.contestId)
              : undefined
          }
          onClose={() => setOpenTeam(null)}
        />
      )}
    </div>
  );
}

/** Totals for a backend that predates the `totals` field. */
function sumPlayed({ played }: MyTournaments): MyTournamentsTotals {
  return {
    tournaments_played: played.length,
    teams_count: played.reduce((sum, t) => sum + t.teams_count, 0),
    contests_count: played.reduce((sum, t) => sum + t.contests_count, 0),
  };
}

/**
 * A contest's leaderboard, asked to scroll to and highlight the signed-in
 * user's row: the profile links here to show where the user finished.
 */
function myLeaderboardHref(contestId: string): string {
  return `/contests/${contestId}/leaderboard?me=1`;
}

/**
 * What a contest that has not ended is doing now, in words a player reads
 * right: the backend's "live" status means open for entry, not running.
 */
function currentLabel(entry: ContestEntry): string {
  return new Date(entry.startAt).getTime() > Date.now() ? "Upcoming" : "Live";
}

function TeamsSection({
  title,
  emptyText,
  entries,
  formatDate,
  onOpen,
}: Readonly<{
  title: string;
  emptyText: string;
  entries: ContestEntry[];
  formatDate: (dateString?: string | null) => string;
  onOpen: (team: OpenTeam) => void;
}>) {
  return (
    <div className="rounded-2xl sm:rounded-3xl border border-border-subtle bg-bg-card shadow-lg p-4 sm:p-7">
      <h2 className="text-lg sm:text-xl font-black text-text-main flex items-center gap-2 mb-1">
        <Users className="h-5 w-5 text-accent-pink-500" />
        {title}
      </h2>
      <p className="text-xs sm:text-sm text-text-muted mb-3 sm:mb-4">
        Tap a team to see its players and the contest leaderboard.
      </p>

      {entries.length === 0 ? (
        <p className="text-text-muted">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
          {entries.map((entry) => (
            <button
              key={entry.enrollmentId}
              type="button"
              onClick={() =>
                onOpen({
                  contestId: entry.contestId,
                  teamId: entry.teamId,
                  isPublic: entry.isPublic,
                })
              }
              className="text-left rounded-xl sm:rounded-2xl border border-border-subtle bg-bg-card-soft p-3.5 sm:p-4 transition hover:border-accent-pink-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink-500"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 pr-1">
                  <p className="font-bold text-sm sm:text-base text-text-main leading-snug">
                    {entry.teamName}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {entry.contestName}
                  </p>
                </div>
                {entry.rank ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning-tonal text-warning px-2 py-1 text-[11px] sm:text-xs font-semibold whitespace-nowrap">
                    <Crown className="h-3.5 w-3.5" />
                    Rank #{entry.rank}
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-bg-chip text-text-main px-2 py-1 text-[11px] sm:text-xs font-medium whitespace-nowrap">
                    Rank N/A
                  </span>
                )}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs">
                {!entry.isPast && (
                  <span className="rounded-full bg-success-tonal text-success px-2 py-1 font-semibold">
                    {currentLabel(entry)}
                  </span>
                )}
                <span className="rounded-full bg-accent-pink-tonal text-accent-pink-soft px-2 py-1">
                  Points: {entry.points ?? "N/A"}
                </span>
                {entry.teamCreatedAt && (
                  <span className="rounded-full bg-bg-chip text-text-main px-2 py-1">
                    Created: {formatDate(entry.teamCreatedAt)}
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-0.5 font-semibold text-accent-pink-soft">
                  View team
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
