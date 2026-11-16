import { useTournamentStore } from '../core/store/tournamentStore';
import { API_BASE_URL } from '../common/constants';

// Every tournament is served by the one Wall-E Arena backend. Requests name
// their tournament in this header, as the website does from its subdomain;
// without it the backend refuses anything that belongs to one tournament
// (contests, teams, players, sponsors, admin).
export const TENANT_HEADER = 'X-Tournament-Slug';

/** The backend every request goes to. */
export const getCurrentApiEndpoint = (): string => API_BASE_URL;

/**
 * The tournament header for the selected tournament, to spread into a
 * request's headers. Empty while nothing is selected: sign-in and the
 * tournament list work without one.
 */
export const tenantHeaders = (): Record<string, string> => {
    const slug = useTournamentStore.getState().selectedTournament?.slug;
    return slug ? { [TENANT_HEADER]: slug } : {};
};

/**
 * Build a full API URL for a given endpoint
 * @param endpoint - The API endpoint (e.g., '/api/v1/users')
 * @returns Full API URL
 */
export const buildApiUrl = (endpoint: string): string => {
    const baseUrl = getCurrentApiEndpoint();

    // Ensure endpoint starts with /
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    // Remove trailing slash from baseUrl and combine
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');

    return `${cleanBaseUrl}${cleanEndpoint}`;
};

/**
 * Check if the backend is reachable
 * @returns Promise<boolean> indicating if the API is reachable
 */
export const checkApiHealth = async (): Promise<boolean> => {
    const healthUrl = buildApiUrl('/api/health');
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(healthUrl, {
            method: 'GET',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.ok;
    } catch (error) {
        console.warn(`API health check failed for ${healthUrl}:`, error);
        return false;
    }
};
