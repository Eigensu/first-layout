import axios from 'axios';
import { Tournament, TournamentStatus } from '../types/tournament';
import { getCurrentApiEndpoint } from '../config/apiConfig';

// The backend's own tournament registry: every tournament that is not
// archived. It replaces the separate landing.wallearena.com directory, which
// pointed each tournament at its own backend.
const TOURNAMENT_LIST_PATH = '/api/tournaments';

// Public and the same for every tournament, so no token or tournament header.
const tournamentDirectoryApi = axios.create({
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

const ROOT_DOMAIN = 'wallearena.com';

/** A tournament's website, on its own subdomain. */
export const tournamentSiteUrl = (slug: string): string => `https://${slug}.${ROOT_DOMAIN}`;

/**
 * The website's password reset for this tournament, or null if the tournament
 * has no slug to address it by.
 *
 * The app has no reset screens of its own: it sends people here, and since one
 * account works in every tournament, the password set there works in the app.
 * A selection stored before the switch to one backend lacks `slug` until the
 * bootstrap matches it to the tournament list; until then it has none.
 */
export const passwordResetUrl = (
    tournament: Pick<Tournament, 'slug'>,
): string | null =>
    tournament.slug ? `${tournamentSiteUrl(tournament.slug)}/auth/forgot-password` : null;

// Registry status -> the app's. Archived tournaments are not listed at all.
const STATUS: Record<string, TournamentStatus> = {
    live: 'LIVE',
    draft: 'UPCOMING',
    completed: 'COMPLETED',
};

// Transform a registry entry (GET /api/tournaments) to our tournament structure
const transformExternalTournament = (externalTournament: any): Tournament => {
    const slug: string = externalTournament.slug;
    const status = STATUS[externalTournament.status] ?? 'COMPLETED';
    const startTime: string = externalTournament.start_at ?? '';

    // Format duration
    const formatDuration = (startTime: string) => {
        try {
            const start = new Date(startTime);
            const day = start.getDate().toString().padStart(2, '0');
            const month = (start.getMonth() + 1).toString().padStart(2, '0');
            const year = start.getFullYear();
            return `${day}/${month}/${year}`;
        } catch {
            return startTime;
        }
    };

    // Format registration info
    const getRegistrationInfo = (status: string, startTime: string) => {
        if (status === 'UPCOMING') {
            try {
                const start = new Date(startTime);
                const regClose = new Date(start.getTime() - 24 * 60 * 60 * 1000); // 1 day before
                const day = regClose.getDate().toString().padStart(2, '0');
                const month = (regClose.getMonth() + 1).toString().padStart(2, '0');
                const year = regClose.getFullYear();
                return `Registration closes: ${day}/${month}/${year}`;
            } catch {
                return undefined;
            }
        }
        return undefined;
    };

    return {
        id: slug,
        slug,
        title: externalTournament.name,
        // The directory's game_name was the short name, which is the slug.
        game_name: slug,
        stream_url: tournamentSiteUrl(slug),
        image_url: externalTournament.logo_url ?? undefined,
        status,
        status_display: status === 'LIVE' ? 'Live' :
            status === 'UPCOMING' ? 'Upcoming' : 'Completed',
        start_time: startTime,
        duration: startTime ? formatDuration(startTime) : undefined,
        registration_closes: startTime ? getRegistrationInfo(status, startTime) : undefined,
    };
};

class TournamentService {
    /**
     * Get all tournaments from the backend's registry
     */
    async getTournaments(status?: TournamentStatus, refresh = false): Promise<Tournament[]> {
        try {
            const response = await tournamentDirectoryApi.get(TOURNAMENT_LIST_PATH, {
                baseURL: getCurrentApiEndpoint(),
            });

            // Check if the response is an error object instead of tournament array
            if (response.data && typeof response.data === 'object' && response.data.detail) {
                throw new Error(`API Error: ${response.data.detail}`);
            }

            // Check if response.data is an array
            if (!Array.isArray(response.data)) {
                throw new Error('API returned invalid data format (expected array)');
            }

            // Transform external data to our tournament structure
            const tournaments: Tournament[] = response.data.map(transformExternalTournament);

            // Filter by status if requested
            if (status) {
                return tournaments.filter(t => t.status === status);
            }

            return tournaments;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (!error.response) {
                    throw new Error('Network error. Please check your connection and try again.');
                }

                if (error.response.status >= 500) {
                    throw new Error('Server error. Please try again later.');
                }

                if (error.response.status === 400) {
                    throw new Error(`API error: ${error.response.data?.detail || 'Bad request'}`);
                }
            }

            console.error('Error fetching tournaments:', error);
            throw new Error('Failed to fetch tournaments');
        }
    }

    /**
     * Get a specific tournament by ID
     */
    async getTournament(tournamentId: string): Promise<Tournament> {
        try {
            const tournaments = await this.getTournaments();
            const tournament = tournaments.find(t => t.id === tournamentId);

            if (!tournament) {
                throw new Error('Tournament not found');
            }

            return tournament;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get live tournaments
     */
    async getLiveTournaments(): Promise<Tournament[]> {
        return this.getTournaments('LIVE');
    }

    /**
     * Get upcoming tournaments
     */
    async getUpcomingTournaments(): Promise<Tournament[]> {
        return this.getTournaments('UPCOMING');
    }

    /**
     * Get completed tournaments
     */
    async getCompletedTournaments(): Promise<Tournament[]> {
        return this.getTournaments('COMPLETED');
    }

    /**
     * Check tournament directory health
     */
    async checkHealth(): Promise<{ status: string }> {
        try {
            const response = await tournamentDirectoryApi.get(TOURNAMENT_LIST_PATH, {
                baseURL: getCurrentApiEndpoint(),
            });
            return { status: response.status === 200 ? 'healthy' : 'unhealthy' };
        } catch (error) {
            console.error('Error checking tournament health:', error);
            throw new Error('Failed to check tournament service health');
        }
    }
}

export const tournamentService = new TournamentService();