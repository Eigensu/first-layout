import axios, { AxiosInstance, AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, CONTENT_TYPES, AUTH, API, ROUTES, LS_KEYS } from '@/common/consts';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': CONTENT_TYPES.JSON,
  },
  timeout: API.TIMEOUT_MS,
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Let the browser set multipart boundaries for FormData uploads.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
      if (config.headers instanceof AxiosHeaders) {
        config.headers.delete('Content-Type');
        config.headers.delete('content-type');
      } else {
        delete config.headers['Content-Type'];
        delete config.headers['content-type'];
      }
    }

    const token = localStorage.getItem(LS_KEYS.ACCESS_TOKEN);
    if (token && config.headers) {
      config.headers[AUTH.HEADER] = `${AUTH.BEARER_PREFIX}${token}`;
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
    const isAuthEndpoint = originalRequest?.url?.includes(`${API.PREFIX}/auth/login`) || 
                          originalRequest?.url?.includes(`${API.PREFIX}/auth/register`) ||
                          originalRequest?.url?.includes(`${API.PREFIX}/auth/refresh`);

    // For auth endpoints with 401, just reject with a clear error - NO retry, NO redirect
    if (error.response?.status === 401 && isAuthEndpoint) {
      return Promise.reject(error);
    }

    // If error is 401 and we haven't retried yet and it's not an auth endpoint
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem(LS_KEYS.REFRESH_TOKEN) || sessionStorage.getItem(LS_KEYS.REFRESH_TOKEN);
        
        if (refreshToken) {
          // Try to refresh the token
          const response = await axios.post(
            `${API_BASE_URL}${API.PREFIX}/auth/refresh`,
            null,
            {
              params: { refresh_token: refreshToken }
            }
          );

          const { access_token, refresh_token: new_refresh_token } = response.data;

          // Update tokens in storage
          localStorage.setItem(LS_KEYS.ACCESS_TOKEN, access_token);
          if (localStorage.getItem(LS_KEYS.REFRESH_TOKEN)) {
            localStorage.setItem(LS_KEYS.REFRESH_TOKEN, new_refresh_token);
          } else {
            sessionStorage.setItem(LS_KEYS.REFRESH_TOKEN, new_refresh_token);
          }

          // Update the authorization header
          if (originalRequest.headers) {
            originalRequest.headers[AUTH.HEADER] = `${AUTH.BEARER_PREFIX}${access_token}`;
          }

          // Retry the original request
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // If refresh fails, clear tokens and redirect to login
        localStorage.removeItem(LS_KEYS.ACCESS_TOKEN);
        localStorage.removeItem(LS_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(LS_KEYS.USER);
        sessionStorage.removeItem(LS_KEYS.REFRESH_TOKEN);
        
        // Only redirect if we're not already on an auth page
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/auth/')) {
          window.location.href = ROUTES.LOGIN;
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
    const responseData: unknown = error.response?.data;
    let detailRaw: unknown;
    if (responseData && typeof responseData === 'object' && 'detail' in responseData) {
      detailRaw = (responseData as { detail?: unknown }).detail;
    }

    let detail: string | undefined;
    if (typeof detailRaw === 'string') {
      detail = detailRaw;
    } else if (Array.isArray(detailRaw)) {
      // pydantic-style list of errors
      detail = detailRaw
        .map((d: unknown) => {
          if (d && typeof d === 'object') {
            const obj = d as { msg?: unknown; message?: unknown };
            if (typeof obj.msg === 'string') return obj.msg;
            if (typeof obj.message === 'string') return obj.message;
          }
          return JSON.stringify(d);
        })
        .join('; ');
    } else if (detailRaw && typeof detailRaw === 'object') {
      detail = JSON.stringify(detailRaw);
    }
    
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
