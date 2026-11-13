import apiClient from '../client';
import type {
  ContestStatus,
  ContestVisibility,
  PointsScope,
  ContestType,
  ContestFormat,
} from '@/common/consts/contest';

export type {
  ContestStatus,
  ContestVisibility,
  PointsScope,
  ContestType,
  ContestFormat,
};

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
  contest_format: ContestFormat;
  purse: number;
  squad_size: number | null;
  /** Raw per-contest override; null means the global setting applies. */
  max_players_per_team: number | null;
  /** The limit actually enforced, global fallback already applied. */
  effective_max_players_per_team: number;
  /**
   * Points come from the MVP tables of the CricHeroes matches the contest
   * covers; the server refuses hand-entered points while it is on.
   */
  points_from_cricheroes: boolean;
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
  contest_format?: ContestFormat;
  purse?: number;
  squad_size?: number | null;
  max_players_per_team?: number | null;
  points_from_cricheroes?: boolean;
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
  contest_format?: ContestFormat;
  purse?: number;
  squad_size?: number | null;
  max_players_per_team?: number | null;
  points_from_cricheroes?: boolean;
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

/** A CricHeroes match whose MVP table counts towards a contest. */
export interface CricHeroesCountedMatch {
  match_id: number;
  match_date_time?: string | null;
  teams: string;
  players: number;
}

/**
 * How a contest is scored from CricHeroes, worked out on the server from what
 * the scheduled sync has stored: reading it costs no CricHeroes call.
 */
export interface ContestCricHeroesPoints {
  contest_id: string;
  points_from_cricheroes: boolean;
  /** null: the tournament is not linked to CricHeroes. */
  cricheroes_tournament_id: number | null;
  matches_counted: CricHeroesCountedMatch[];
  /** Completed matches in the window whose MVP table the sync has yet to read. */
  matches_awaiting_mvp: number[];
  players_scored: number;
  /** "Name (Team)" of CricHeroes players with points but no player linked here. */
  unlinked_players: string[];
}

export interface LeaderboardExportResponse {
  blob: Blob;
  filename: string;
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
  // force=true tells the server to apply rule changes that would leave
  // existing squads breaking them. The server names this escape hatch in its
  // own error message, so the client has to be able to send it.
  update: async (id: string, data: ContestUpdate, force?: boolean): Promise<Contest> => {
    const response = await apiClient.put(`/api/admin/contests/${id}`, data, {
      params: force ? { force: true } : undefined,
    });
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
  getCricHeroesPoints: async (contestId: string): Promise<ContestCricHeroesPoints> => {
    const response = await apiClient.get(`/api/admin/contests/${contestId}/cricheroes-points`);
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

  /**
   * Download a contest's leaderboard as an .xlsx file
   */
  exportLeaderboard: async (contestId: string): Promise<LeaderboardExportResponse> => {
    const response = await apiClient.get(`/api/admin/contests/${contestId}/leaderboard/export`, {
      responseType: 'blob',
    });

    const contentDisposition = response.headers['content-disposition'] as string | undefined;
    let filename = `leaderboard_${contestId}.xlsx`;
    const match = contentDisposition?.match(/filename=([^;]+)/i);
    if (match?.[1]) {
      filename = match[1].trim().replace(/^"|"$/g, '');
    }

    return {
      blob: response.data as Blob,
      filename,
    };
  },
};
