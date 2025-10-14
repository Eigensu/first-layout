import apiClient from '../client';

export interface Slot {
  id: string;
  code: string;
  name: string;
  min_select: number;
  max_select: number;
  description?: string;
  requirements?: Record<string, any>;
  player_count: number;
  created_at: string;
  updated_at: string;
}

export interface SlotCreate {
  code: string;
  name: string;
  min_select?: number;
  max_select?: number;
  description?: string;
  requirements?: Record<string, any>;
}

export interface SlotUpdate {
  name?: string;
  min_select?: number;
  max_select?: number;
  description?: string;
  requirements?: Record<string, any>;
}

export interface SlotListResponse {
  slots: Slot[];
  total: number;
  page: number;
  page_size: number;
}

export interface GetSlotsParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PlayerSummary {
  id: string;
  name: string;
  team: string;
  role: string;
  points: number;
  status: string;
  price: number;
  slot: string | null;
  image_url?: string;
  stats?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SlotPlayersResponse {
  players: PlayerSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface PlayerIdsBody {
  player_ids: string[];
}

export const slotsApi = {
  /**
   * Get all slots with pagination and filters
   */
  getSlots: async (params?: GetSlotsParams): Promise<SlotListResponse> => {
    const response = await apiClient.get('/api/admin/slots', { params });
    return response.data;
  },

  /**
   * Get a single slot by ID
   */
  getSlot: async (id: string): Promise<Slot> => {
    const response = await apiClient.get(`/api/admin/slots/${id}`);
    return response.data;
  },

  /**
   * Create a new slot
   */
  createSlot: async (data: SlotCreate): Promise<Slot> => {
    const response = await apiClient.post('/api/admin/slots', data);
    return response.data;
  },

  /**
   * Update an existing slot
   */
  updateSlot: async (id: string, data: SlotUpdate): Promise<Slot> => {
    const response = await apiClient.put(`/api/admin/slots/${id}`, data);
    return response.data;
  },

  /**
   * Delete a slot (optionally force to unassign players first)
   */
  deleteSlot: async (id: string, force?: boolean): Promise<{ message?: string; unassigned_players?: number } | void> => {
    const response = await apiClient.delete(`/api/admin/slots/${id}`, { params: force ? { force: true } : undefined });
    return response.data;
  },

  /**
   * Get players assigned to a slot
   */
  getSlotPlayers: async (id: string, params?: { page?: number; page_size?: number; search?: string; team?: string; role?: string; }): Promise<SlotPlayersResponse> => {
    const response = await apiClient.get(`/api/admin/slots/${id}/players`, { params });
    return response.data;
  },

  /**
   * Assign players to a slot
   */
  assignPlayers: async (id: string, body: PlayerIdsBody): Promise<{ assigned: number }> => {
    const response = await apiClient.post(`/api/admin/slots/${id}/players`, body);
    return response.data;
  },

  /**
   * Unassign a single player from a slot
   */
  unassignPlayer: async (id: string, playerId: string): Promise<{ unassigned: number }> => {
    const response = await apiClient.delete(`/api/admin/slots/${id}/players/${playerId}`);
    return response.data;
  },

  /**
   * Bulk unassign players from a slot
   */
  bulkUnassignPlayers: async (id: string, body: PlayerIdsBody): Promise<{ unassigned: number }> => {
    const response = await apiClient.delete(`/api/admin/slots/${id}/players`, { data: body });
    return response.data;
  },
};
