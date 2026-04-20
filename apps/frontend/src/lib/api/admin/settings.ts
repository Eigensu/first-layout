import apiClient from '../client';

export const adminSettingsApi = {
  uploadDefaultLogo: async (file: File): Promise<{ url: string; message: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/api/admin/settings/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  getDefaultLogo: async (): Promise<Blob> => {
    const response = await apiClient.get('/api/settings/logo', {
      responseType: 'blob',
    });
    return response.data;
  },
  getSettings: async (): Promise<{ min_players_per_team: number; max_players_per_team: number; default_contest_logo_file_id?: string | null }> => {
    const response = await apiClient.get('/api/admin/settings');
    return response.data;
  },
  updateSettings: async (data: { min_players_per_team?: number; max_players_per_team?: number }): Promise<any> => {
    const response = await apiClient.put('/api/admin/settings', data);
    return response.data;
  },
};
