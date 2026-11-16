import { api, handleApiError } from '../lib/api-client';

// Admin Contest Types
export interface Contest {
    id: string;
    code: string;
    name: string;
    description?: string;
    start_at: string;
    end_at: string;
    status: 'live' | 'ongoing' | 'completed' | 'archived';
    visibility: 'public' | 'private';
    points_scope: string;
    contest_type: 'full' | 'daily';
    allowed_teams: string[];
    created_at: string;
    updated_at: string;
}

export interface ContestCreate {
    code: string;
    name: string;
    description?: string;
    start_at: string;
    end_at: string;
    status: 'live' | 'ongoing' | 'completed' | 'archived';
    visibility: 'public' | 'private';
    points_scope: string;
    contest_type: 'full' | 'daily';
    allowed_teams: string[];
}

export interface ContestListResponse {
    contests: Contest[];
    total: number;
    page: number;
    page_size: number;
}

// Admin Player Types
export interface AdminPlayer {
    id: string;
    name: string;
    team: string;
    points: number;
    status: string;
    price: number;
    slot: string;
    image_url?: string;
    stats?: any;
    created_at: string;
    updated_at: string;
}

export interface AdminPlayerCreate {
    name: string;
    team: string;
    points: number;
    status: string;
    price: number;
    slot: string;
    image_url?: string;
    stats?: any;
}

export interface AdminPlayerUpdate {
    name?: string;
    team?: string;
    points?: number;
    status?: string;
    price?: number;
    slot?: string;
    image_url?: string;
    stats?: any;
}

export interface AdminPlayerListResponse {
    players: AdminPlayer[];
    total: number;
    page: number;
    page_size: number;
}

// Admin Slot Types
export interface AdminSlot {
    id: string;
    code: string;
    name: string;
    min_select: number;
    max_select: number;
    description?: string;
    requirements?: any;
    player_count: number;
    created_at: string;
    updated_at: string;
}

export interface AdminSlotCreate {
    code: string;
    name: string;
    min_select: number;
    max_select: number;
    description?: string;
    requirements?: any;
}

export interface AdminSlotUpdate {
    name?: string;
    min_select?: number;
    max_select?: number;
    description?: string;
    requirements?: any;
}

export interface AdminSlotListResponse {
    slots: AdminSlot[];
    total: number;
    page: number;
    page_size: number;
}

// Admin Users/Teams Types
export interface AdminUser {
    user_id: string;
    username: string;
    full_name: string;
    team_count: number;
}

export interface AdminUserTeam {
    team_id: string;
    team_name: string;
    total_points: number;
    created_at: string;
    enrolled?: boolean;
    enrollment_id?: string;
}

export interface AdminUsersResponse {
    users: AdminUser[];
    total: number;
    page: number;
    page_size: number;
}

export interface AdminUserTeamsResponse {
    user: {
        user_id: string;
        username: string;
        full_name: string;
    };
    teams: AdminUserTeam[];
    total: number;
    page: number;
    page_size: number;
}

// Enrollment Types
export interface EnrollmentBulkRequest {
    team_ids: string[];
}

export interface UnenrollBulkRequest {
    enrollment_ids?: string[];
    team_ids?: string[];
}

export interface EnrollmentResponse {
    id: string;
    team_id: string;
    user_id: string;
    contest_id: string;
    status: string;
    enrolled_at: string;
    removed_at?: string;
}

// Player Points Types
export interface PlayerPointsItem {
    player_id: string;
    points: number;
}

export interface PlayerPointsBulkUpsertRequest {
    updates: PlayerPointsItem[];
}

export interface PlayerPointsResponseItem {
    player_id: string;
    name?: string;
    team?: string;
    points: number;
    updated_at: string;
}

// Sponsor Types
export interface Sponsor {
    id: string;
    name: string;
    logo: string;
    tier: 'platinum' | 'gold' | 'silver' | 'bronze';
    description: string;
    website?: string;
    featured?: boolean;
    active?: boolean;
    priority?: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface SponsorCreate {
    name: string;
    logo: string;
    tier: 'platinum' | 'gold' | 'silver' | 'bronze';
    description: string;
    website?: string;
    featured?: boolean;
    active?: boolean;
    priority?: number;
}

export interface SponsorUpdate {
    name?: string;
    logo?: string;
    tier?: 'platinum' | 'gold' | 'silver' | 'bronze';
    description?: string;
    website?: string;
    featured?: boolean;
    active?: boolean;
    priority?: number;
}

export interface AvailablePriorities {
    gaps: number[];
    next: number;
    used: number[];
}

export const adminService = {
    // Contest Management
    contests: {
        list: async (params?: {
            page?: number;
            page_size?: number;
            status?: string;
            search?: string;
        }): Promise<ContestListResponse> => {
            const response = await api.get('/api/admin/contests', { params });
            return response.data;
        },

        get: async (contestId: string): Promise<Contest> => {
            const response = await api.get(`/api/admin/contests/${contestId}`);
            return response.data;
        },

        create: async (data: ContestCreate): Promise<Contest> => {
            const response = await api.post('/api/admin/contests', data);
            return response.data;
        },

        update: async (contestId: string, data: Partial<ContestCreate>): Promise<Contest> => {
            const response = await api.put(`/api/admin/contests/${contestId}`, data);
            return response.data;
        },

        delete: async (contestId: string, force?: boolean): Promise<void> => {
            await api.delete(`/api/admin/contests/${contestId}`, {
                params: { force: force || false }
            });
        },

        enrollTeams: async (contestId: string, data: EnrollmentBulkRequest): Promise<EnrollmentResponse[]> => {
            const response = await api.post(`/api/admin/contests/${contestId}/enroll-teams`, data);
            return response.data;
        },

        unenrollTeams: async (contestId: string, data: UnenrollBulkRequest): Promise<{ unenrolled: number }> => {
            const response = await api.delete(`/api/admin/contests/${contestId}/enrollments`, { data });
            return response.data;
        },

        getPlayerPoints: async (contestId: string): Promise<PlayerPointsResponseItem[]> => {
            const response = await api.get(`/api/admin/contests/${contestId}/player-points`);
            return response.data;
        },

        updatePlayerPoints: async (contestId: string, updates: PlayerPointsItem[]): Promise<PlayerPointsResponseItem[]> => {
            const response = await api.put(`/api/admin/contests/${contestId}/player-points`, {
                updates
            });
            return response.data;
        },
    },

    // Player Management
    players: {
        list: async (params?: {
            page?: number;
            page_size?: number;
            search?: string;
            status?: string;
            sort_by?: string;
            sort_order?: 'asc' | 'desc';
        }): Promise<AdminPlayerListResponse> => {
            const response = await api.get('/api/admin/players', { params });
            return response.data;
        },

        get: async (playerId: string): Promise<AdminPlayer> => {
            const response = await api.get(`/api/admin/players/${playerId}`);
            return response.data;
        },

        create: async (data: AdminPlayerCreate): Promise<AdminPlayer> => {
            const response = await api.post('/api/admin/players', data);
            return response.data;
        },

        update: async (playerId: string, data: AdminPlayerUpdate): Promise<AdminPlayer> => {
            const response = await api.put(`/api/admin/players/${playerId}`, data);
            return response.data;
        },

        delete: async (playerId: string): Promise<void> => {
            await api.delete(`/api/admin/players/${playerId}`);
        },
    },

    // Slot Management
    slots: {
        list: async (params?: {
            page?: number;
            page_size?: number;
            search?: string;
        }): Promise<AdminSlotListResponse> => {
            const response = await api.get('/api/admin/slots', { params });
            return response.data;
        },

        get: async (slotId: string): Promise<AdminSlot> => {
            const response = await api.get(`/api/admin/slots/${slotId}`);
            return response.data;
        },

        create: async (data: AdminSlotCreate): Promise<AdminSlot> => {
            const response = await api.post('/api/admin/slots', data);
            return response.data;
        },

        update: async (slotId: string, data: AdminSlotUpdate): Promise<AdminSlot> => {
            const response = await api.put(`/api/admin/slots/${slotId}`, data);
            return response.data;
        },

        delete: async (slotId: string, force?: boolean): Promise<{ message: string; unassigned_players: number }> => {
            const response = await api.delete(`/api/admin/slots/${slotId}`, {
                params: { force: force || false }
            });
            return response.data;
        },

        getPlayers: async (slotId: string, params?: {
            page?: number;
            page_size?: number;
            search?: string;
            team?: string;
        }): Promise<AdminPlayerListResponse> => {
            const response = await api.get(`/api/admin/slots/${slotId}/players`, { params });
            return response.data;
        },

        assignPlayers: async (slotId: string, playerIds: string[]): Promise<{ assigned: number }> => {
            const response = await api.post(`/api/admin/slots/${slotId}/players`, {
                player_ids: playerIds
            });
            return response.data;
        },

        unassignPlayer: async (slotId: string, playerId: string): Promise<{ unassigned: number }> => {
            const response = await api.delete(`/api/admin/slots/${slotId}/players/${playerId}`);
            return response.data;
        },

        bulkUnassignPlayers: async (slotId: string, playerIds: string[]): Promise<{ unassigned: number }> => {
            const response = await api.delete(`/api/admin/slots/${slotId}/players`, {
                data: { player_ids: playerIds }
            });
            return response.data;
        },

        migrate: async (dryRun?: boolean): Promise<any> => {
            const response = await api.post('/api/admin/slots/migrate', null, {
                params: { dry_run: dryRun || false }
            });
            return response.data;
        },
    },

    // Users & Teams Management
    users: {
        listUsersWithTeams: async (params?: {
            page?: number;
            page_size?: number;
            search?: string;
        }): Promise<AdminUsersResponse> => {
            const response = await api.get('/api/admin/users-with-teams', { params });
            return response.data;
        },

        getUserTeams: async (userId: string, params?: {
            contest_id?: string;
            page?: number;
            page_size?: number;
        }): Promise<AdminUserTeamsResponse> => {
            const response = await api.get(`/api/admin/users/${userId}/teams`, { params });
            return response.data;
        },
    },

    // Sponsors Management
    sponsors: {
        list: async (params?: {
            tier?: string;
            featured?: boolean;
            active?: boolean;
        }): Promise<Sponsor[]> => {
            const response = await api.get('/api/v1/sponsors/', { params });
            return response.data.sponsors || response.data;
        },

        get: async (sponsorId: string): Promise<Sponsor> => {
            const response = await api.get(`/api/v1/sponsors/${sponsorId}`);
            return response.data.sponsor || response.data;
        },

        create: async (data: SponsorCreate): Promise<Sponsor> => {
            const response = await api.post('/api/v1/sponsors/', data);
            return response.data.sponsor || response.data;
        },

        update: async (sponsorId: string, data: SponsorUpdate): Promise<Sponsor> => {
            const response = await api.put(`/api/v1/sponsors/${sponsorId}`, data);
            return response.data.sponsor || response.data;
        },

        delete: async (sponsorId: string): Promise<void> => {
            await api.delete(`/api/v1/sponsors/${sponsorId}`);
        },

        uploadLogo: async (sponsorId: string, file: File): Promise<{ url: string; message: string }> => {
            const formData = new FormData();
            formData.append('file', file);
            const response = await api.post(`/api/v1/sponsors/${sponsorId}/upload-logo`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            return response.data;
        },

        getAvailablePriorities: async (featured: boolean): Promise<AvailablePriorities> => {
            const response = await api.get('/api/v1/sponsors/available-priorities', {
                params: { featured }
            });
            return response.data;
        },
    },
};