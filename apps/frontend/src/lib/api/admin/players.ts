import apiClient from '../client';

export interface Player {
  id: string;
  name: string;
  team: string;
  role: string;
  points: number;
  status: string;
  price: number;
  slot?: string;
  image_url?: string;
  stats?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PlayerCreate {
  name: string;
  team: string;
  role: string;
  points?: number;
  status?: string;
  price?: number;
  slot?: string;
  image_url?: string;
  stats?: Record<string, any>;
}

export interface PlayerUpdate {
  name?: string;
  team?: string;
  role?: string;
  points?: number;
  status?: string;
  price?: number;
  slot?: string;
  image_url?: string;
  stats?: Record<string, any>;
}

export interface PlayerListResponse {
  players: Player[];
  total: number;
  page: number;
  page_size: number;
}

export interface GetPlayersParams {
  page?: number;
  page_size?: number;
  search?: string;
  role?: string;
  status?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const playersApi = {
  /**
   * Get all players with pagination and filters
   */
  getPlayers: async (params?: GetPlayersParams): Promise<PlayerListResponse> => {
    const response = await apiClient.get('/api/admin/players', { params });
    return response.data;
  },

  /**
   * Get a single player by ID
   */
  getPlayer: async (id: string): Promise<Player> => {
    const response = await apiClient.get(`/api/admin/players/${id}`);
    return response.data;
  },

  /**
   * Create a new player
   */
  createPlayer: async (data: PlayerCreate): Promise<Player> => {
    const response = await apiClient.post('/api/admin/players', data);
    return response.data;
  },

  /**
   * Update an existing player
   */
  updatePlayer: async (id: string, data: PlayerUpdate): Promise<Player> => {
    const response = await apiClient.put(`/api/admin/players/${id}`, data);
    return response.data;
  },

  /**
   * Delete a player
   */
  deletePlayer: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/admin/players/${id}`);
  },
};
