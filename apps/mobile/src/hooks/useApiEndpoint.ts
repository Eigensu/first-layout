import { useMemo } from 'react';
import { useTournamentStore } from '../core/store/tournamentStore';
import {
    getCurrentApiEndpoint,
    buildApiUrl,
} from '../config/apiConfig';

/**
 * Hook for managing tournament-specific API endpoints
 */
export const useApiEndpoint = () => {
    const { selectedTournament } = useTournamentStore();

    const apiEndpoint = useMemo(() => getCurrentApiEndpoint(), [selectedTournament]);

    const buildUrl = useMemo(() => {
        return (endpoint: string) => {
            return buildApiUrl(endpoint);
        };
    }, [selectedTournament]);

    return {
        /** Current API endpoint based on selected tournament */
        apiEndpoint,

        /** Selected tournament object */
        selectedTournament,

        /** Build full API URL for an endpoint */
        buildUrl,

        /** Check if a tournament is selected */
        hasTournament: !!selectedTournament,
    };
};

/**
 * Hook for building image URLs with proper API endpoint
 */
export const useImageUrl = () => {
    const { apiEndpoint } = useApiEndpoint();

    const buildImageUrl = (imageUrl: string) => {
        if (!imageUrl) return null;

        // If it's already a full URL, return as is
        if (imageUrl.startsWith('http')) {
            return imageUrl;
        }

        // Build URL with current tournament API endpoint
        return `${apiEndpoint}${imageUrl}`;
    };

    return { buildImageUrl };
};

/**
 * Hook for API health checking
 */
export const useApiHealth = () => {
    const { selectedTournament } = useTournamentStore();

    const checkCurrentTournamentHealth = async (): Promise<boolean> => {
        if (!selectedTournament) return false;

        try {
            const { checkApiHealth } = await import('../config/apiConfig');
            return await checkApiHealth();
        } catch (error) {
            console.warn('API health check failed:', error);
            return false;
        }
    };

    return {
        checkCurrentTournamentHealth,
        selectedTournament,
    };
};