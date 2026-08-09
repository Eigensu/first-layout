import apiClient from './client';
import type { LoginCredentials, RegisterCredentials, AuthTokens, User } from '@/types/auth';

export const authApi = {
  /**
   * Register a new user
   */
  register: async (credentials: RegisterCredentials): Promise<AuthTokens> => {
    // Always use FormData to match backend Form(...) params
    const form = new FormData();
    form.append('username', credentials.username);
    form.append('email', credentials.email);
    form.append('password', credentials.password);
    if (credentials.full_name) form.append('full_name', credentials.full_name);
    if (credentials.mobile) form.append('mobile', credentials.mobile);
    if (credentials.avatar) form.append('avatar', credentials.avatar);

    const response = await apiClient.post<AuthTokens>(
      '/api/auth/register',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  /**
   * Login with username and password
   */
  login: async (credentials: LoginCredentials): Promise<AuthTokens> => {
    const response = await apiClient.post<AuthTokens>('/api/auth/login', credentials);
    return response.data;
  },

  /**
   * Sign in or sign up using a Google Identity Services ID token
   */
  googleLogin: async (idToken: string): Promise<AuthTokens> => {
    const response = await apiClient.post<AuthTokens>('/api/auth/google', {
      id_token: idToken,
    });
    return response.data;
  },

  /**
   * Refresh access token
   */
  refreshToken: async (refreshToken: string): Promise<AuthTokens> => {
    const response = await apiClient.post<AuthTokens>(
      '/api/auth/refresh',
      null,
      {
        params: { refresh_token: refreshToken }
      }
    );
    return response.data;
  },

  /**
   * Logout and revoke refresh token
   */
  logout: async (refreshToken: string): Promise<void> => {
    await apiClient.post('/api/auth/logout', null, {
      params: { refresh_token: refreshToken }
    });
  },

  /**
   * Get current user profile
   */
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>('/api/users/me');
    return response.data;
  },

  /**
   * Update current user profile
   */
  updateProfile: async (data: { full_name?: string; avatar_url?: string }): Promise<User> => {
    const response = await apiClient.put<User>('/api/users/me', null, {
      params: data
    });
    return response.data;
  },
  
  /**
   * Reset password by verifying mobile number
   */
  resetPasswordByMobile: async (payload: { mobile: string; new_password: string }): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(
      '/api/auth/reset-password-mobile',
      payload
    );
    return response.data;
  },
};
