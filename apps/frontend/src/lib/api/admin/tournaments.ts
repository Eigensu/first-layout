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
};
