import apiClient from '../client';
import type { TournamentStatus } from '@/common/consts/tournament';

export type { TournamentStatus };

export interface Tournament {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  status: TournamentStatus;
  start_at?: string | null;
  end_at?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  api_base_url?: string | null;
  /** The same tournament on CricHeroes, whose cached stats its /stats page
   *  shows. Null: not linked. */
  cricheroes_tournament_id?: number | null;
  /** Only on the response to a save that linked a CricHeroes tournament, when
   *  CricHeroes could not be asked whether they serve it: the link is saved,
   *  and this says what is not confirmed. */
  cricheroes_warning?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TournamentListResponse {
  tournaments: Tournament[];
  total: number;
  page: number;
  page_size: number;
}

export interface TournamentCreate {
  slug: string;
  name: string;
  description?: string;
  logo_url?: string;
  status?: TournamentStatus;
  start_at?: string; // ISO
  end_at?: string; // ISO
  primary_color?: string;
  secondary_color?: string;
  api_base_url?: string;
  /** A positive whole number; the backend refuses anything else. */
  cricheroes_tournament_id?: number;
}

// Optional fields may be null to explicitly clear a previously set value.
export type TournamentUpdate = {
  [K in keyof TournamentCreate]?: TournamentCreate[K] | null;
};

export interface SlugAvailability {
  slug: string;
  available: boolean;
  reason?: string | null;
}

/** Someone appointed to run one tournament. Platform admins run them all and
 *  are not listed. */
export interface TournamentAdmin {
  user_id: string;
  username: string;
  full_name?: string | null;
  email?: string | null;
  // The name they go by in this tournament, which need not be their username.
  display_name: string;
}

export const adminTournamentsApi = {
  list: async (params?: {
    page?: number;
    page_size?: number;
    status?: TournamentStatus;
    search?: string;
  }): Promise<TournamentListResponse> => {
    const response = await apiClient.get('/api/admin/tournaments', { params });
    return response.data;
  },
  get: async (id: string): Promise<Tournament> => {
    const response = await apiClient.get(`/api/admin/tournaments/${id}`);
    return response.data;
  },
  checkSlug: async (slug: string): Promise<SlugAvailability> => {
    const response = await apiClient.get(
      `/api/admin/tournaments/check-slug/${encodeURIComponent(slug)}`
    );
    return response.data;
  },
  create: async (data: TournamentCreate): Promise<Tournament> => {
    const response = await apiClient.post('/api/admin/tournaments', data);
    return response.data;
  },
  update: async (id: string, data: TournamentUpdate): Promise<Tournament> => {
    const response = await apiClient.put(`/api/admin/tournaments/${id}`, data);
    return response.data;
  },
  archive: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/api/admin/tournaments/${id}`);
    return response.data;
  },
  hardDelete: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/api/admin/tournaments/${id}`, {
      params: { force: true },
    });
    return response.data;
  },
  listAdmins: async (id: string): Promise<TournamentAdmin[]> => {
    const response = await apiClient.get(`/api/admin/tournaments/${id}/admins`);
    return response.data.admins;
  },
  /** `identifier` is whatever they sign in with: mobile, email or username. */
  appointAdmin: async (id: string, identifier: string): Promise<TournamentAdmin> => {
    const response = await apiClient.post(`/api/admin/tournaments/${id}/admins`, {
      identifier,
    });
    return response.data;
  },
  removeAdmin: async (id: string, userId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete(
      `/api/admin/tournaments/${id}/admins/${userId}`
    );
    return response.data;
  },
};
