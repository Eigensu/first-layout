import axios from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../common/constants';
import { DebugLogger } from '../components/DebugPanel';
import { tenantHeaders } from '../config/apiConfig';

// Initialize debug logging for auth service
DebugLogger.addLog(`Auth Service initialized with URL: ${API_BASE_URL}`, 'info');
DebugLogger.addLog(`Environment variable: ${process.env.EXPO_PUBLIC_API_BASE_URL || 'Not set'}`, 'info');
DebugLogger.addLog(`Development mode: ${__DEV__}`, 'info');

// Use a separate axios instance for auth (no token interceptor)
const authApi = axios.create({
    timeout: API_TIMEOUT,
    headers: {
        'Content-Type': 'application/json',
    },
});

// One backend for every tournament. Signing in names the selected tournament
// too, which records the player as a member of it.
authApi.interceptors.request.use(
    (config) => {
        config.baseURL = API_BASE_URL;
        Object.assign(config.headers, tenantHeaders());
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// The backend rate-limits sign-in, sign-up and password reset, and its 429
// says when to try again in `detail.message`. Every call below rethrows a
// non-Axios error as it is, so turning the 429 into that sentence here is
// what shows it, instead of "Request failed with status code 429".
authApi.interceptors.response.use(
    (response) => response,
    (error) => {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
            const limited = new Error(
                error.response.data?.detail?.message ||
                    'Too many attempts. Please try again later.'
            );
            (limited as any).status = 429;
            return Promise.reject(limited);
        }
        return Promise.reject(error);
    }
);

export interface LoginRequest {
    username: string; // Backend uses 'username' field for email
    password: string;
}

export interface LoginResponse {
    access_token: string;
    refresh_token?: string;
    token_type: string;
}

export interface SignupRequest {
    email: string;
    password: string;
    username: string;
    full_name?: string;
    mobile?: string;
}

export interface SignupResponse {
    id: string;
    email: string;
    username: string;
    display_name: string;
    created_at: string;
}

export const authService = {
    /**
     * Login with email and password
     */
    login: async (email: string, password: string): Promise<LoginResponse> => {
        if (!email?.trim() || !password?.trim()) {
            const error = new Error('Email and password are required');
            DebugLogger.addLog('Login failed: Missing credentials', 'error');
            throw error;
        }

        DebugLogger.addLog(`Attempting login to: ${API_BASE_URL}`, 'info');
        DebugLogger.addLog(`Email: ${email}`, 'info');
        DebugLogger.addLog(`Timeout: ${authApi.defaults.timeout}ms`, 'info');

        try {
            DebugLogger.addLog('Making HTTP request...', 'info');
            const startTime = Date.now();

            const response = await authApi.post<LoginResponse>('/api/auth/login', {
                username: email.trim(), // Backend uses 'username' field for email/username
                password: password,
            });

            const endTime = Date.now();
            DebugLogger.addLog(`Request completed in ${endTime - startTime}ms`, 'success');
            DebugLogger.addLog('Login successful!', 'success');

            if (!response.data?.access_token) {
                throw new Error('Invalid response: missing access token');
            }

            return response.data;
        } catch (error) {
            DebugLogger.addLog('Login failed!', 'error');

            if (axios.isAxiosError(error)) {
                DebugLogger.addLog(`Request URL: ${error.config?.url}`, 'error');
                DebugLogger.addLog(`Base URL: ${error.config?.baseURL}`, 'error');
                DebugLogger.addLog(`Status: ${error.response?.status || 'No response'}`, 'error');
                DebugLogger.addLog(`Response: ${JSON.stringify(error.response?.data) || 'No response data'}`, 'error');
                DebugLogger.addLog(`Error message: ${error.message}`, 'error');

                if (error.code) {
                    DebugLogger.addLog(`Error code: ${error.code}`, 'error');
                }

                // Check for network errors
                if (!error.response) {
                    DebugLogger.addLog('NETWORK ERROR: No response from server', 'error');
                    DebugLogger.addLog('Check if backend is running and accessible', 'error');

                    // Create a more user-friendly error for network issues
                    const networkError = new Error('Network error. Please check your connection and try again.');
                    (networkError as any).code = 'NETWORK_ERROR';
                    throw networkError;
                }

                // Handle specific HTTP status codes
                if (error.response.status === 401) {
                    const authError = new Error('Invalid username or password');
                    (authError as any).status = 401;
                    throw authError;
                }

                if (error.response.status === 403) {
                    const disabledError = new Error('This account has been deactivated');
                    (disabledError as any).status = 403;
                    throw disabledError;
                }

                if (error.response.status === 404) {
                    const notFoundError = new Error('Account not found');
                    (notFoundError as any).status = 404;
                    throw notFoundError;
                }

                if (error.response.status >= 500) {
                    const serverError = new Error('Server error. Please try again later.');
                    (serverError as any).status = error.response.status;
                    throw serverError;
                }
            } else {
                DebugLogger.addLog(`Unknown error: ${String(error)}`, 'error');
            }

            throw error;
        }
    },

    /**
     * Sign in (or sign up) with a Google ID token obtained from the native
     * Google Sign-In SDK
     */
    loginWithGoogle: async (idToken: string): Promise<LoginResponse> => {
        if (!idToken) {
            const error = new Error('Missing Google ID token');
            DebugLogger.addLog('Google sign-in failed: Missing ID token', 'error');
            throw error;
        }

        DebugLogger.addLog(`Attempting Google sign-in to: ${API_BASE_URL}`, 'info');

        try {
            const response = await authApi.post<LoginResponse>('/api/auth/google', {
                id_token: idToken,
            });

            DebugLogger.addLog('Google sign-in successful!', 'success');

            if (!response.data?.access_token) {
                throw new Error('Invalid response: missing access token');
            }

            return response.data;
        } catch (error) {
            DebugLogger.addLog('Google sign-in failed!', 'error');

            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    const authError = new Error(error.response.data?.detail || 'Google sign-in was rejected');
                    (authError as any).status = 401;
                    throw authError;
                }

                if (error.response?.status === 403) {
                    const disabledError = new Error('This account has been deactivated');
                    (disabledError as any).status = 403;
                    throw disabledError;
                }

                if (!error.response) {
                    const networkError = new Error('Network error. Please check your connection and try again.');
                    (networkError as any).code = 'NETWORK_ERROR';
                    throw networkError;
                }
            }

            throw error;
        }
    },

    /**
     * Sign in (or sign up) with an Apple identity token obtained from
     * expo-apple-authentication. `fullName` is only present on the user's
     * very first authorization and is ignored by the backend afterwards.
     */
    loginWithApple: async (identityToken: string, fullName?: string): Promise<LoginResponse> => {
        if (!identityToken) {
            const error = new Error('Missing Apple identity token');
            DebugLogger.addLog('Apple sign-in failed: Missing identity token', 'error');
            throw error;
        }

        DebugLogger.addLog(`Attempting Apple sign-in to: ${API_BASE_URL}`, 'info');

        try {
            const response = await authApi.post<LoginResponse>('/api/auth/apple', {
                identity_token: identityToken,
                full_name: fullName,
            });

            DebugLogger.addLog('Apple sign-in successful!', 'success');

            if (!response.data?.access_token) {
                throw new Error('Invalid response: missing access token');
            }

            return response.data;
        } catch (error) {
            DebugLogger.addLog('Apple sign-in failed!', 'error');

            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    const authError = new Error(error.response.data?.detail || 'Apple sign-in was rejected');
                    (authError as any).status = 401;
                    throw authError;
                }

                if (error.response?.status === 403) {
                    const disabledError = new Error('This account has been deactivated');
                    (disabledError as any).status = 403;
                    throw disabledError;
                }

                if (!error.response) {
                    const networkError = new Error('Network error. Please check your connection and try again.');
                    (networkError as any).code = 'NETWORK_ERROR';
                    throw networkError;
                }
            }

            throw error;
        }
    },

    /**
     * Signup new user
     */
    signup: async (data: SignupRequest): Promise<LoginResponse> => {
        if (!data?.username?.trim() || !data?.email?.trim() || !data?.password?.trim()) {
            const error = new Error('Username, email, and password are required');
            DebugLogger.addLog('Signup failed: Missing required fields', 'error');
            throw error;
        }

        try {
            DebugLogger.addLog('Attempting user registration', 'info');

            // Backend /register endpoint uses Form data and returns Token (not user)
            const formData = new FormData();
            formData.append('username', data.username.trim());
            formData.append('email', data.email.trim());
            formData.append('password', data.password);
            if (data.full_name?.trim()) {
                formData.append('full_name', data.full_name.trim());
            }
            if (data.mobile?.trim()) {
                formData.append('mobile', data.mobile.trim());
            }

            const response = await authApi.post<LoginResponse>('/api/auth/register', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            DebugLogger.addLog('Registration successful!', 'success');

            if (!response.data?.access_token) {
                throw new Error('Invalid response: missing access token');
            }

            return response.data;
        } catch (error) {
            DebugLogger.addLog('Registration failed!', 'error');

            if (axios.isAxiosError(error)) {
                if (error.response?.status === 400) {
                    const message = error.response.data?.detail || 'Registration failed. Please check your information.';
                    const validationError = new Error(message);
                    (validationError as any).status = 400;
                    throw validationError;
                }

                if (!error.response) {
                    const networkError = new Error('Network error. Please check your connection and try again.');
                    (networkError as any).code = 'NETWORK_ERROR';
                    throw networkError;
                }
            }

            throw error;
        }
    },

    /**
     * Refresh access token using refresh token
     */
    refreshToken: async (refreshToken: string): Promise<LoginResponse> => {
        if (!refreshToken?.trim()) {
            const error = new Error('Refresh token is required');
            DebugLogger.addLog('Token refresh failed: Missing refresh token', 'error');
            throw error;
        }

        try {
            DebugLogger.addLog('Attempting token refresh', 'info');

            // Backend expects refresh_token as a query parameter
            const response = await authApi.post<LoginResponse>(
                `/api/auth/refresh?refresh_token=${encodeURIComponent(refreshToken.trim())}`
            );

            DebugLogger.addLog('Token refresh successful!', 'success');

            if (!response.data?.access_token) {
                throw new Error('Invalid response: missing access token');
            }

            return response.data;
        } catch (error) {
            DebugLogger.addLog('Token refresh failed!', 'error');

            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    const authError = new Error('Refresh token expired or invalid');
                    (authError as any).status = 401;
                    throw authError;
                }

                if (!error.response) {
                    const networkError = new Error('Network error during token refresh');
                    (networkError as any).code = 'NETWORK_ERROR';
                    throw networkError;
                }
            }

            throw error;
        }
    },

    /**
     * Verify token is valid
     */
    verifyToken: async (token: string): Promise<boolean> => {
        if (!token?.trim()) {
            DebugLogger.addLog('Token verification failed: Missing token', 'error');
            return false;
        }

        try {
            DebugLogger.addLog('Verifying token', 'info');

            await authApi.get('/api/users/me', {
                headers: {
                    Authorization: `Bearer ${token.trim()}`,
                },
            });

            DebugLogger.addLog('Token verification successful', 'success');
            return true;
        } catch (error) {
            DebugLogger.addLog('Token verification failed', 'error');
            return false;
        }
    },
};
