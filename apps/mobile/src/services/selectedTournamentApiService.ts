import axios from 'axios';
import { useTournamentStore } from '../core/store/tournamentStore';
import { DebugLogger } from '../components/DebugPanel';
import { getCurrentApiEndpoint, tenantHeaders } from '../config/apiConfig';

/**
 * Service for making API calls for the selected tournament
 * Every tournament shares one backend; requests name the tournament in a header.
 */
class SelectedTournamentApiService {
    private getApiClient() {
        const selectedTournament = useTournamentStore.getState().selectedTournament;

        if (!selectedTournament) {
            throw new Error('No tournament selected. Please select a tournament first.');
        }

        const apiClient = axios.create({
            baseURL: getCurrentApiEndpoint(),
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                ...tenantHeaders(),
            },
        });

        DebugLogger.addLog(`Using tournament: ${selectedTournament.slug}`, 'info');

        return apiClient;
    }

    /**
     * Make a GET request to the selected tournament's API
     */
    async get<T = any>(endpoint: string, config?: any): Promise<T> {
        try {
            const client = this.getApiClient();
            const response = await client.get<T>(endpoint, config);
            return response.data;
        } catch (error) {
            DebugLogger.addLog(`Error making GET request to ${endpoint}`, 'error');
            throw error;
        }
    }

    /**
     * Make a POST request to the selected tournament's API
     */
    async post<T = any>(endpoint: string, data?: any, config?: any): Promise<T> {
        try {
            const client = this.getApiClient();
            const response = await client.post<T>(endpoint, data, config);
            return response.data;
        } catch (error) {
            DebugLogger.addLog(`Error making POST request to ${endpoint}`, 'error');
            throw error;
        }
    }

    /**
     * Make a PUT request to the selected tournament's API
     */
    async put<T = any>(endpoint: string, data?: any, config?: any): Promise<T> {
        try {
            const client = this.getApiClient();
            const response = await client.put<T>(endpoint, data, config);
            return response.data;
        } catch (error) {
            DebugLogger.addLog(`Error making PUT request to ${endpoint}`, 'error');
            throw error;
        }
    }

    /**
     * Make a DELETE request to the selected tournament's API
     */
    async delete<T = any>(endpoint: string, config?: any): Promise<T> {
        try {
            const client = this.getApiClient();
            const response = await client.delete<T>(endpoint, config);
            return response.data;
        } catch (error) {
            DebugLogger.addLog(`Error making DELETE request to ${endpoint}`, 'error');
            throw error;
        }
    }

    /**
     * Get the API endpoint, or null while no tournament is selected
     */
    getCurrentApiEndpoint(): string | null {
        const selectedTournament = useTournamentStore.getState().selectedTournament;
        return selectedTournament ? getCurrentApiEndpoint() : null;
    }

    /**
     * Check if a tournament is selected
     */
    isTournamentSelected(): boolean {
        const selectedTournament = useTournamentStore.getState().selectedTournament;
        return !!selectedTournament;
    }
}

export const selectedTournamentApiService = new SelectedTournamentApiService();