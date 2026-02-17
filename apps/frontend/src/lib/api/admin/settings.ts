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
};
