import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useTournamentStore } from '../store/tournamentStore';
import { Tournament } from '../../types/tournament';

/**
 * Single entry point for changing the active tournament.
 *
 * One account works in every tournament and one backend serves them all, so
 * switching keeps the session: requests just start naming the new tournament.
 * Everything cached belongs to the old one, though, including the profile,
 * whose admin flag is per tournament, so the cache is dropped and refetched.
 */
export const useTournamentSwitch = () => {
  const queryClient = useQueryClient();
  const { selectedTournament, setSelectedTournament } = useTournamentStore();
  const { isAuthenticated } = useAuthStore();

  const switchTournament = (tournament: Tournament) => {
    if (selectedTournament?.id === tournament.id) return;

    setSelectedTournament(tournament);
    queryClient.clear();
  };

  return { switchTournament, isAuthenticated };
};
