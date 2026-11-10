// Common constants for the mobile app

// API Configuration: the one backend that serves every tournament
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || (__DEV__
    ? 'http://192.168.29.177:8000'  // Your Mac's LAN IP for development
    : 'https://walle-api.wallearena.com'); // Production API URL

export const API_FULL_URL = API_BASE_URL;

// Other common constants can be added here
export const APP_NAME = 'Wall-E Arena';
export const APP_VERSION = '1.0.0';

// Google Sign-In (Google Cloud Console > APIs & Services > Credentials).
// GOOGLE_WEB_CLIENT_ID must be the same "Web application" client as the
// backend's GOOGLE_CLIENT_ID, since that's the audience the backend verifies.
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

// Timeouts
export const API_TIMEOUT = 30000; // 30 seconds
export const CAROUSEL_AUTO_PLAY_INTERVAL = 5000; // 5 seconds

// Storage Keys
export const STORAGE_KEYS = {
    AUTH_TOKEN: 'auth_token',
    USER_PREFERENCES: 'user_preferences',
    THEME_MODE: 'theme_mode',
} as const;