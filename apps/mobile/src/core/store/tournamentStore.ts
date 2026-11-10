import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tournament } from '../../types/tournament';

interface TournamentState {
    // State
    selectedTournament: Tournament | null;
    tournaments: Tournament[];

    // Actions
    setSelectedTournament: (tournament: Tournament) => void;
    setTournaments: (tournaments: Tournament[]) => void;
    clearSelection: () => void;
}

export const useTournamentStore = create<TournamentState>()(
    persist(
        (set) => ({
            // Initial state
            selectedTournament: null,
            tournaments: [],

            // Set selected tournament and update API endpoint
            setSelectedTournament: (tournament: Tournament) => {
                set({ selectedTournament: tournament });
            },

            // Set available tournaments
            setTournaments: (tournaments: Tournament[]) => {
                set({ tournaments });
            },

            // Clear selection
            clearSelection: () => {
                set({ selectedTournament: null });
            },
        }),
        {
            name: 'tournament-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);