import { useTournamentStore } from '../store/tournamentStore';
import { Tournament } from '../../types/tournament';
import { getCurrentApiEndpoint as apiEndpoint } from '../../config/apiConfig';

export const useTournament = () => {
    const {
        selectedTournament,
        tournaments,
        setSelectedTournament,
        setTournaments,
        clearSelection,
    } = useTournamentStore();

    const selectTournament = (tournament: Tournament) => {
        setSelectedTournament(tournament);
    };

    const isSelected = (tournamentId: string) => {
        return selectedTournament?.id === tournamentId;
    };

    // Every tournament shares one backend now.
    const getCurrentApiEndpoint = () => {
        return selectedTournament ? apiEndpoint() : undefined;
    };

    return {
        selectedTournament,
        tournaments,
        selectTournament,
        setTournaments,
        clearSelection,
        isSelected,
        getCurrentApiEndpoint,
    };
};