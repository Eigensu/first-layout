import apiClient from '../client';

export type ContestStatus = 'live' | 'ongoing' | 'completed' | 'archived';
export type ContestVisibility = 'public' | 'private';
export type PointsScope = 'time_window' | 'snapshot';
export type ContestType = 'daily' | 'full';

export interface Contest {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  start_at: string;
  end_at: string;
  status: ContestStatus;
  visibility: ContestVisibility;
  points_scope: PointsScope;
  contest_type: ContestType;
  allowed_teams: string[];
  created_at: string;
  updated_at: string;
}

export interface ContestListResponse {
  contests: Contest[];
  total: number;
  page: number;
  page_size: number;
}

export interface ContestCreate {
  code: string;
  name: string;
  description?: string;
  logo_url?: string;
  start_at: string; // ISO
  end_at: string; // ISO
  status?: ContestStatus;
  visibility?: ContestVisibility;
  points_scope?: PointsScope;
  contest_type?: ContestType;
  allowed_teams?: string[];
}

export interface ContestUpdate {
  name?: string;
  description?: string;
  logo_url?: string;
  start_at?: string;
  end_at?: string;
  status?: ContestStatus;
  visibility?: ContestVisibility;
  points_scope?: PointsScope;
  contest_type?: ContestType;
  allowed_teams?: string[];
}

export interface EnrollmentBulkRequest { team_ids: string[] }
export interface UnenrollBulkRequest { team_ids?: string[]; enrollment_ids?: string[] }

export interface EnrollmentResponse {
  id: string;
  team_id: string;
  user_id: string;
  contest_id: string;
  status: 'active' | 'removed';
  enrolled_at: string;
  removed_at?: string | null;
}

export interface PlayerPointsResponseItem {
  player_id: string;
  name?: string | null;
  team?: string | null;
  points: number;
  updated_at: string;
}

export interface PlayerPointsBulkUpsertRequest {
  updates: { player_id: string; points: number }[];
}

export const adminContestsApi = {
  list: async (params?: { page?: number; page_size?: number; status?: ContestStatus; search?: string }): Promise<ContestListResponse> => {
    const response = await apiClient.get('/api/admin/contests', { params });
    return response.data;
  },
  get: async (id: string): Promise<Contest> => {
    const response = await apiClient.get(`/api/admin/contests/${id}`);
    return response.data;
  },
  create: async (data: ContestCreate): Promise<Contest> => {
    const response = await apiClient.post('/api/admin/contests', data);
    return response.data;
  },
  update: async (id: string, data: ContestUpdate): Promise<Contest> => {
    const response = await apiClient.put(`/api/admin/contests/${id}`, data);
    return response.data;
  },
  delete: async (id: string, force?: boolean): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/api/admin/contests/${id}`, { params: force ? { force: true } : undefined });
    return response.data;
  },
  enrollTeams: async (contestId: string, body: EnrollmentBulkRequest): Promise<EnrollmentResponse[]> => {
    const response = await apiClient.post(`/api/admin/contests/${contestId}/enroll-teams`, body);
    return response.data;
  },
  unenroll: async (contestId: string, body: UnenrollBulkRequest): Promise<{ unenrolled: number }> => {
    const response = await apiClient.delete(`/api/admin/contests/${contestId}/enrollments`, { data: body });
    return response.data;
  },
  getPlayerPoints: async (contestId: string): Promise<PlayerPointsResponseItem[]> => {
    const response = await apiClient.get(`/api/admin/contests/${contestId}/player-points`);
    return response.data;
  },
  upsertPlayerPoints: async (
    contestId: string,
    body: PlayerPointsBulkUpsertRequest
  ): Promise<PlayerPointsResponseItem[]> => {
    const response = await apiClient.put(`/api/admin/contests/${contestId}/player-points`, body);
    return response.data;
  },
  uploadLogo: async (contestId: string, file: File): Promise<{ url: string; message: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(`/api/admin/contests/${contestId}/upload-logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};
