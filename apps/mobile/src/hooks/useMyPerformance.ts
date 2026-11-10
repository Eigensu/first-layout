import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { arenaService } from '../services/arenaService';
import { useAuthStore } from '../core/store/authStore';
import { useTournamentStore } from '../core/store/tournamentStore';
import { Contest } from '../types/arena';
import { arenaKeys } from '../features/arena/queryKeys';
import {
    findTeamStanding,
    useMyContestLeaderboards,
} from '../features/arena/hooks/useMyContestLeaderboards';
import { formatPoints } from '../utils/points';

export interface ParticipationEntry {
    contestId: string;
    contestName: string;
    contestStatus: Contest['status'];
    teamId: string;
    teamName: string;
    points: number;
    /** Null while the contest has no leaderboard yet. */
    rank: number | null;
}

/**
 * The signed-in user's season at a glance: which contests they're in, the team
 * they entered with, and where that team currently ranks. Backs the home
 * widgets. Every query uses the same key as My Teams (see arenaKeys), so
 * opening that tab doesn't fetch again, and a team change that invalidates
 * those keys shows up here too.
 */
export const useMyPerformance = () => {
    const { isAuthenticated } = useAuthStore();
    const { selectedTournament } = useTournamentStore();
    const enabled = isAuthenticated && !!selectedTournament;

    const { data: teamsData, isLoading: teamsLoading } = useQuery({
        queryKey: arenaKeys.teams(),
        queryFn: () => arenaService.getMyTeams({ limit: 100 }),
        enabled,
    });

    // Same key as every other screen that lists enrollments: creating a team
    // invalidates it, and this widget has to see that.
    const { data: enrollments, isLoading: enrollmentsLoading } = useQuery({
        queryKey: arenaKeys.enrollments(),
        queryFn: () => arenaService.getMyEnrollments(),
        enabled,
    });

    const { data: contestsData } = useQuery({
        queryKey: arenaKeys.contestList({ pageSize: 100 }),
        queryFn: () => arenaService.getContests({ page: 1, page_size: 100 }),
        enabled,
    });

    const activeEnrollments = useMemo(
        () => (enrollments || []).filter((e) => e.status === 'active'),
        [enrollments]
    );

    const contestIds = useMemo(
        () => [...new Set(activeEnrollments.map((e) => e.contest_id))],
        [activeEnrollments]
    );

    const { data: leaderboards } = useMyContestLeaderboards(contestIds, enabled);

    const entries = useMemo<ParticipationEntry[]>(() => {
        const teams = teamsData?.teams || [];
        const contests = contestsData?.contests || [];

        return activeEnrollments
            .map((enrollment) => {
                const team = teams.find((t) => t.id === enrollment.team_id);
                const contest = contests.find((c) => c.id === enrollment.contest_id);
                if (!team) return null;

                const row = findTeamStanding(leaderboards?.[enrollment.contest_id], team.id);

                return {
                    contestId: enrollment.contest_id,
                    contestName: contest?.name || 'Contest',
                    contestStatus: contest?.status || 'live',
                    teamId: team.id,
                    teamName: team.team_name,
                    points: formatPoints(row?.points ?? team.total_points),
                    rank: row?.rank ?? null,
                } as ParticipationEntry;
            })
            .filter((e): e is ParticipationEntry => e !== null)
            .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    }, [activeEnrollments, teamsData, contestsData, leaderboards]);

    const rankedEntries = entries.filter((e) => e.rank !== null);

    return {
        isLoading: enabled && (teamsLoading || enrollmentsLoading),
        entries,
        contestsJoined: contestIds.length,
        teamsCount: teamsData?.teams.length ?? 0,
        bestRank: rankedEntries.length > 0 ? (rankedEntries[0].rank as number) : null,
        totalPoints: formatPoints((teamsData?.teams || []).reduce((sum, t) => sum + (t.total_points || 0), 0)),
    };
};
