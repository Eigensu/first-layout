import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Don't retry for auth endpoints (login, register, refresh)
    const isAuthEndpoint = originalRequest?.url?.includes('/api/auth/login') || 
                          originalRequest?.url?.includes('/api/auth/register') ||
                          originalRequest?.url?.includes('/api/auth/refresh');

    // For auth endpoints with 401, just reject with a clear error - NO retry, NO redirect
    if (error.response?.status === 401 && isAuthEndpoint) {
      return Promise.reject(error);
    }

    // If error is 401 and we haven't retried yet and it's not an auth endpoint
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
        
        if (refreshToken) {
          // Try to refresh the token
          const response = await axios.post(
            `${API_URL}/api/auth/refresh`,
            null,
            {
              params: { refresh_token: refreshToken }
            }
          );

          const { access_token, refresh_token: new_refresh_token } = response.data;

          // Update tokens in storage
          localStorage.setItem('access_token', access_token);
          if (localStorage.getItem('refresh_token')) {
            localStorage.setItem('refresh_token', new_refresh_token);
          } else {
            sessionStorage.setItem('refresh_token', new_refresh_token);
          }

          // Update the authorization header
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${access_token}`;
          }

          // Retry the original request
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // If refresh fails, clear tokens and redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('refresh_token');
        
        // Only redirect if we're not already on an auth page
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/auth/')) {
          window.location.href = '/auth/login';
        }
        
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;

// Helper function to get error message
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;
    
    // Check for specific 401 errors
    if (status === 401) {
      if (detail === 'Incorrect username or password') {
        return 'Invalid username or password. Please try again.';
      }
      if (detail === 'Could not validate credentials') {
        return 'Invalid or expired session. Please login again.';
      }
      if (detail) {
        return detail;
      }
      return 'Authentication failed. Please check your credentials.';
    }
    
    // Check for other HTTP errors
    if (status === 403) {
      return 'Access denied. You do not have permission to perform this action.';
    }
    
    if (status === 404) {
      return 'The requested resource was not found.';
    }
    
    if (status && status >= 500) {
      return 'Server error. Please try again later.';
    }
    
    return detail || error.message || 'An error occurred';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
};
