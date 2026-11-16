import { useCallback } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { arenaService } from '../../../services/arenaService';
import type { LeaderboardEntry, LeaderboardResponse } from '../../../types/arena';
import { arenaKeys } from '../queryKeys';

export type LeaderboardsByContest = Record<string, LeaderboardResponse | null>;

/**
 * The leaderboard of each contest the user is in, keyed by contest id
 * (null while loading or if it failed). Each contest is its own query, under
 * the same key as that contest's Leaderboard screen. So Home and My Teams
 * share the cache with it, a change in one contest refetches only that
 * contest's board, and joining a new contest fetches only the new one.
 */
export const useMyContestLeaderboards = (contestIds: string[], enabled: boolean) => {
    // Stable per contest set, so React Query can reuse the combined result
    // between renders instead of building a new object each time.
    const combine = useCallback(
        (results: UseQueryResult<LeaderboardResponse>[]) => {
            const data: LeaderboardsByContest = {};
            results.forEach((result, i) => {
                data[contestIds[i]] = result.data ?? null;
            });
            return { data };
        },
        [contestIds],
    );

    return useQueries({
        queries: contestIds.map((contestId) => ({
            queryKey: arenaKeys.contestLeaderboard(contestId),
            queryFn: () => arenaService.getContestLeaderboard(contestId),
            enabled,
        })),
        combine,
    });
};

/**
 * This team's row on a contest leaderboard. `entries` stops at the API's row
 * limit, but `currentUserEntry` is the signed-in user's own row, ranked over
 * the whole board. Falling back to it keeps a team ranked below the limit
 * from showing no rank.
 */
export const findTeamStanding = (
    leaderboard: LeaderboardResponse | null | undefined,
    teamId: string,
): LeaderboardEntry | null =>
    leaderboard?.entries?.find((e) => e.teamId === teamId) ??
    (leaderboard?.currentUserEntry?.teamId === teamId ? leaderboard.currentUserEntry : null);
