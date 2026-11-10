import { api } from '../lib/api-client';
import {
    Contest,
    ContestListResponse,
    Player,
    PlayerHot,
    PlayerHotIds,
    PlayerHotSingle,
    Slot,
    SlotListResponse,
    Team,
    TeamCreate,
    TeamUpdate,
    TeamsListResponse,
    Enrollment,
    LeaderboardResponse,
    ContestTeamResponse,
    ContestStatus,
} from '../types/arena';

export const arenaService = {
    // ===== CONTESTS =====

    /**
     * Get list of public contests with optional filtering
     */
    getContests: async (params?: {
        page?: number;
        page_size?: number;
        status?: ContestStatus;
        q?: string; // Search query
    }): Promise<ContestListResponse> => {
        const response = await api.get('/api/contests', { params });
        return response.data;
    },

    /**
     * Get single contest details
     */
    getContest: async (contestId: string): Promise<Contest> => {
        const response = await api.get(`/api/contests/${contestId}`);
        return response.data;
    },

    /**
     * Get contest if user is enrolled (for private contests)
     */
    getContestIfEnrolled: async (contestId: string): Promise<Contest> => {
        const response = await api.get(`/api/contests/${contestId}/me`);
        return response.data;
    },

    /**
     * Get contest leaderboard
     */
    getContestLeaderboard: async (
        contestId: string,
        params?: { skip?: number; limit?: number }
    ): Promise<LeaderboardResponse> => {
        const response = await api.get(`/api/contests/${contestId}/leaderboard`, { params });
        return response.data;
    },

    /**
     * Enroll a team in a contest
     */
    enrollInContest: async (contestId: string, teamId: string): Promise<Enrollment> => {
        const response = await api.post(`/api/contests/${contestId}/enroll`, {
            team_id: teamId,
        });
        return response.data;
    },

    /**
     * Get team details within a contest (with contest-specific points)
     */
    getContestTeam: async (contestId: string, teamId: string): Promise<ContestTeamResponse> => {
        const response = await api.get(`/api/contests/${contestId}/teams/${teamId}`);
        return response.data;
    },

    /**
     * Get user's active enrollments
     */
    getMyEnrollments: async (): Promise<Enrollment[]> => {
        const response = await api.get('/api/contests/enrollments/me');
        return response.data;
    },

    // ===== PLAYERS =====

    /**
     * Get list of players with optional filtering
     */
    getPlayers: async (params?: {
        slot?: string; // Slot ID
        contest_id?: string; // Filter by contest's allowed teams
        limit?: number;
        skip?: number;
    }): Promise<Player[]> => {
        const response = await api.get('/api/players', { params });
        return response.data;
    },

    /**
     * Get single player details
     */
    getPlayer: async (playerId: string): Promise<Player> => {
        const response = await api.get(`/api/players/${playerId}`);
        return response.data;
    },

    /**
     * Get hot players with selection counts
     */
    getHotPlayers: async (params?: {
        contest_id?: string;
        threshold?: number;
        limit?: number;
        skip?: number;
        sort?: 'count_desc' | 'name_asc';
    }): Promise<PlayerHot[]> => {
        const response = await api.get('/api/players/hot', { params });
        return response.data;
    },

    /**
     * Get IDs of hot players only
     */
    getHotPlayerIds: async (params?: {
        contest_id?: string;
        threshold?: number;
        limit?: number;
        skip?: number;
    }): Promise<PlayerHotIds> => {
        const response = await api.get('/api/players/hot/ids', { params });
        return response.data;
    },

    /**
     * Get hot status for a single player
     */
    getPlayerHotStatus: async (playerId: string, contestId?: string): Promise<PlayerHotSingle> => {
        const response = await api.get(`/api/players/${playerId}/hot`, {
            params: contestId ? { contest_id: contestId } : undefined,
        });
        return response.data;
    },

    /**
     * Get players with hot pick data merged in
     */
    getPlayersWithHotStatus: async (params?: {
        slot?: string;
        contest_id?: string;
        limit?: number;
        skip?: number;
    }): Promise<Player[]> => {
        // Fetch players and hot player IDs in parallel
        const [players, hotData] = await Promise.all([
            arenaService.getPlayers(params),
            arenaService.getHotPlayerIds({ contest_id: params?.contest_id }),
        ]);

        const hotPlayerIds = new Set(hotData.player_ids);

        // Merge hot status into players
        return players.map(player => ({
            ...player,
            is_hot_pick: hotPlayerIds.has(player.id),
        }));
    },

    // ===== SLOTS (ROLES) =====

    /**
     * Get list of all slots/roles
     */
    getSlots: async (params?: {
        page?: number;
        page_size?: number;
    }): Promise<SlotListResponse> => {
        const response = await api.get('/api/slots', { params });
        return response.data;
    },

    /**
     * Get single slot details
     */
    getSlot: async (slotId: string): Promise<Slot> => {
        const response = await api.get(`/api/slots/${slotId}`);
        return response.data;
    },

    // ===== TEAMS =====

    /**
     * Create a new team
     */
    createTeam: async (teamData: TeamCreate): Promise<Team> => {
        const response = await api.post('/api/teams/', teamData);
        return response.data;
    },

    /**
     * Get user's teams
     */
    getMyTeams: async (params?: {
        skip?: number;
        limit?: number;
    }): Promise<TeamsListResponse> => {
        const response = await api.get('/api/teams/', { params });
        return response.data;
    },

    /**
     * Get single team details
     */
    getTeam: async (teamId: string): Promise<Team> => {
        const response = await api.get(`/api/teams/${teamId}`);
        return response.data;
    },

    /**
     * Update team
     */
    updateTeam: async (teamId: string, teamData: TeamUpdate): Promise<Team> => {
        const response = await api.put(`/api/teams/${teamId}`, teamData);
        return response.data;
    },

    /**
     * Rename team
     */
    renameTeam: async (teamId: string, teamName: string): Promise<Team> => {
        const response = await api.patch(`/api/teams/${teamId}/rename`, null, {
            params: { team_name: teamName },
        });
        return response.data;
    },

    /**
     * Delete team
     */
    deleteTeam: async (teamId: string): Promise<void> => {
        await api.delete(`/api/teams/${teamId}`);
    },

    // ===== LEADERBOARD =====

    /**
     * Get tournament-specific leaderboard
     */
    getTournamentLeaderboard: async (tournamentId: string): Promise<LeaderboardResponse> => {
        const response = await api.get(`/api/tournaments/${tournamentId}/leaderboard`);
        return response.data;
    },
};
