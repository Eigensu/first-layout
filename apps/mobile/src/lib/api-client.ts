import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../core/store/authStore';
import { useTournamentStore } from '../core/store/tournamentStore';
import { getCurrentApiEndpoint, TENANT_HEADER } from '../config/apiConfig';
import { API_TIMEOUT } from '../common/constants';
import { apiErrorMessage } from '../utils/apiError';

// Extend axios config to include retry flag
declare module 'axios' {
    interface InternalAxiosRequestConfig {
        _retry?: boolean;
    }
}

// Create axios instance with dynamic base URL
export const api = axios.create({
    timeout: API_TIMEOUT,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Function to get current base URL
const getCurrentBaseURL = () => {
    const baseUrl = getCurrentApiEndpoint();
    return baseUrl;
};

// Update base URL before each request
api.interceptors.request.use(
    async (config) => {
        // Set the base URL dynamically
        const baseUrl = getCurrentBaseURL();
        config.baseURL = baseUrl;

        // Check if we have a valid tournament selected for API calls
        const selectedTournament = useTournamentStore.getState().selectedTournament;
        if (!selectedTournament && config.url?.startsWith('/api/') && !config.url?.includes('/tournaments')) {
            // Allow tournament API calls even without a selected tournament
            // But block other API calls if no tournament is selected
            return Promise.reject(new Error('No tournament selected for API call'));
        }

        // Ensure Zustand has finished hydrating from AsyncStorage
        const isHydrated = useAuthStore.persist.hasHydrated();
        if (!isHydrated) {
            await new Promise<void>((resolve) => {
                const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
                    unsubscribe();
                    resolve();
                });
            });
        }

        const token = useAuthStore.getState().token;
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // The backend serves every tournament and scopes each request by this.
        // A request that already names its tournament keeps it.
        if (selectedTournament?.slug && !config.headers.has(TENANT_HEADER)) {
            config.headers[TENANT_HEADER] = selectedTournament.slug;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response Interceptor: Handle Global Errors and Token Refresh
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config;

        // Skip auto-logout for specific endpoints that handle their own 401 errors
        const skipAutoLogoutUrls = ['/api/users/me'];
        const isDeleteRequest = originalRequest?.method?.toLowerCase() === 'delete';
        const shouldSkipAutoLogout = skipAutoLogoutUrls.some(url =>
            originalRequest?.url?.includes(url)
        ) && isDeleteRequest;

        // Handle 401 Unauthorized - Token expired or invalid
        if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !shouldSkipAutoLogout) {
            originalRequest._retry = true;

            const authStore = useAuthStore.getState();
            const refreshToken = authStore.refreshToken;

            if (refreshToken) {
                try {
                    // Try to refresh the token
                    const { authService } = await import('../services/authService');
                    const response = await authService.refreshToken(refreshToken);

                    if (!response?.access_token) {
                        throw new Error('Invalid refresh response');
                    }

                    // Update the token in the store
                    authStore.updateToken(response.access_token);

                    // Retry the original request with the new token
                    if (originalRequest.headers) {
                        originalRequest.headers.Authorization = `Bearer ${response.access_token}`;
                    }
                    return api(originalRequest);
                } catch (refreshError) {
                    // Refresh failed, logout user
                    authStore.logout();
                    return Promise.reject(refreshError);
                }
            } else {
                // No refresh token, logout user
                authStore.logout();
            }
        }

        // Handle network errors
        if (!error.response) {
            // Network error occurred
            console.warn('Network error:', error.message);
        }

        return Promise.reject(error);
    }
);

// Type-safe API error handler
export interface ApiError {
    message: string;
    status?: number;
    code?: string;
}

export const handleApiError = (error: unknown): ApiError => {
    if (axios.isAxiosError(error)) {
        // Extract meaningful error message
        let message = 'An error occurred';
        // An object `detail` (some routes send one) used to end up here as
        // the message; apiErrorMessage pulls out its text.
        const detail = apiErrorMessage(error, '');

        if (detail) {
            message = detail;
        } else if (error.response?.data?.message) {
            message = error.response.data.message;
        } else if (error.message) {
            message = error.message;
        }

        // Handle specific status codes
        if (error.response?.status === 401) {
            message = 'Authentication failed. Please log in again.';
        } else if (error.response?.status === 403) {
            message = 'Access denied. You do not have permission to perform this action.';
        } else if (error.response?.status === 404) {
            message = 'The requested resource was not found.';
        } else if (error.response && error.response.status >= 500) {
            message = 'Server error. Please try again later.';
        } else if (!error.response) {
            message = 'Network error. Please check your connection and try again.';
        }

        return {
            message,
            status: error.response?.status,
            code: error.code,
        };
    }

    // Handle non-axios errors
    if (error instanceof Error) {
        return {
            message: error.message || 'An unexpected error occurred',
        };
    }

    return {
        message: 'An unexpected error occurred',
    };
};
