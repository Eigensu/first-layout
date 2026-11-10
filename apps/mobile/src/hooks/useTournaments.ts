import { useState, useEffect, useCallback } from 'react';
import { Tournament, TournamentStatus } from '../types/tournament';
import { tournamentService } from '../services/tournamentService';

interface UseTournamentsOptions {
    status?: TournamentStatus;
    autoRefresh?: boolean;
    refreshInterval?: number; // in milliseconds
}

interface UseTournamentsReturn {
    tournaments: Tournament[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    refetch: () => Promise<void>;
}

export const useTournaments = (options: UseTournamentsOptions = {}): UseTournamentsReturn => {
    const { status, autoRefresh = false, refreshInterval = 30000 } = options;

    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTournaments = useCallback(async (forceRefresh = false) => {
        try {
            setError(null);
            const data = await tournamentService.getTournaments(status, forceRefresh);
            setTournaments(data);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
            setError(errorMessage);
            console.error('Error fetching tournaments:', err);
        } finally {
            setLoading(false);
        }
    }, [status]);

    const refresh = useCallback(async () => {
        setLoading(true);
        await fetchTournaments(true);
    }, [fetchTournaments]);

    const refetch = useCallback(async () => {
        await fetchTournaments(false);
    }, [fetchTournaments]);

    useEffect(() => {
        fetchTournaments();
    }, [fetchTournaments]);

    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchTournaments();
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [autoRefresh, refreshInterval, fetchTournaments]);

    return {
        tournaments,
        loading,
        error,
        refresh,
        refetch,
    };
};

// Convenience hooks for specific statuses
export const useLiveTournaments = () =>
    useTournaments({ status: 'LIVE', autoRefresh: true, refreshInterval: 15000 });

export const useUpcomingTournaments = () =>
    useTournaments({ status: 'UPCOMING' });

export const useCompletedTournaments = () =>
    useTournaments({ status: 'COMPLETED' });