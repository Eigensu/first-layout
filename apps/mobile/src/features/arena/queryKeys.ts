import type { QueryClient } from '@tanstack/react-query';
import type { ContestStatus } from '../../types/arena';

/**
 * React Query keys for arena data, in one place.
 *
 * Screens used to type these by hand, and they drifted: Home cached the
 * user's enrollments as ['my-enrollments'] while the team builder refreshed
 * ['enrollments'], so a new team never showed up on Home. Two screens also
 * shared a key while fetching different amounts of data (50 vs 100
 * contests, 100 vs 200 leaderboard rows), so whichever ran first decided
 * what the other saw. Every key that depends on request params now names
 * them.
 */
export const arenaKeys = {
    teams: () => ['teams'] as const,
    team: (teamId: string | undefined) => ['team', teamId] as const,
    enrollments: () => ['enrollments'] as const,

    /** Prefix of every contest list below. */
    contests: () => ['contests'] as const,
    contestList: (params: { status?: ContestStatus | null; pageSize: number }) =>
        ['contests', 'list', { status: params.status ?? null, pageSize: params.pageSize }] as const,
    contest: (contestId: string | null | undefined) => ['contest', contestId] as const,

    /** Prefix of every cached leaderboard for one contest, whatever its limit. */
    contestLeaderboards: (contestId: string | null | undefined) =>
        ['contest-leaderboard', contestId] as const,
    /** One contest's leaderboard; `limit` is the row cap sent to the API. */
    contestLeaderboard: (contestId: string | null | undefined, limit?: number) =>
        [...arenaKeys.contestLeaderboards(contestId), limit ?? 'default'] as const,
    /** Every contest's leaderboard (the global Leaderboard screen). */
    allContestLeaderboards: () => ['all-contest-leaderboards'] as const,

    contestTeam: (contestId: string | null | undefined, teamId: string | null | undefined) =>
        ['contest-team', contestId, teamId] as const,
};

/**
 * Refresh everything a team change can affect: the team lists, the
 * enrollments, the team itself and, when it's in a contest, that contest's
 * points and leaderboards (Home's best rank and My Teams' ranks come from
 * those). Use after creating, editing or entering a team.
 */
export const invalidateTeamQueries = (
    queryClient: QueryClient,
    { teamId, contestId }: { teamId?: string | null; contestId?: string | null },
) => {
    queryClient.invalidateQueries({ queryKey: arenaKeys.teams() });
    queryClient.invalidateQueries({ queryKey: arenaKeys.enrollments() });
    if (teamId) {
        queryClient.invalidateQueries({ queryKey: arenaKeys.team(teamId) });
    }
    if (!contestId) return;

    if (teamId) {
        queryClient.invalidateQueries({ queryKey: arenaKeys.contestTeam(contestId, teamId) });
    }
    // Every limit cached for this contest. Home and My Teams read these same
    // per-contest entries, so only this contest's board is fetched again.
    queryClient.invalidateQueries({ queryKey: arenaKeys.contestLeaderboards(contestId) });
    // The global Leaderboard screen fetches every contest's board at once.
    // Mark it stale for its next visit rather than refetching all of them
    // for a change in one.
    queryClient.invalidateQueries({
        queryKey: arenaKeys.allContestLeaderboards(),
        refetchType: 'none',
    });
};
