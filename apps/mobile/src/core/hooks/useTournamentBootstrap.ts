import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tournamentService } from '../../services/tournamentService';
import { useTournamentStore } from '../store/tournamentStore';
import { Tournament } from '../../types/tournament';

/**
 * Whether a selection saved before the switch to one backend is this
 * tournament. Such a selection has the old directory's id and no slug; its
 * short name became the slug, in game_name ("dcpl") or only in title ("Rspl",
 * whose game_name was its full name).
 */
const isLegacySelectionOf = (saved: Tournament, tournament: Tournament): boolean =>
    [saved.game_name, saved.title].some(
        (name) => name?.trim().toLowerCase() === tournament.slug
    );

/**
 * Guarantees a tournament is always selected, app-wide.
 *
 * Every request names the selected tournament, which is how the one backend
 * knows whose contests and teams to serve, and api-client rejects calls
 * outright when nothing is selected — so an empty selection isn't a cosmetic
 * gap, it's a dead app. Owning this at the root (rather than on the landing
 * screen) means deep links, a cold start on any tab, and the moments right
 * after logout all have a tournament.
 *
 * It also re-syncs the persisted selection against the backend's tournament
 * list on every launch, so a tournament whose status changed server-side
 * doesn't stay stale in AsyncStorage forever.
 */
export const useTournamentBootstrap = () => {
    const { selectedTournament, setTournaments, setSelectedTournament } =
        useTournamentStore();
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['tournaments'],
        queryFn: () => tournamentService.getTournaments(),
    });

    // The persisted selection rehydrates from AsyncStorage asynchronously. If
    // the directory request won that race we'd read selectedTournament as null
    // and overwrite the user's actual choice with the default, so wait.
    const [hydrated, setHydrated] = useState(() =>
        useTournamentStore.persist.hasHydrated()
    );

    useEffect(() => {
        if (hydrated) return;
        return useTournamentStore.persist.onFinishHydration(() => setHydrated(true));
    }, [hydrated]);

    useEffect(() => {
        if (!hydrated || !data?.length) return;
        setTournaments(data);

        const stored = selectedTournament
            ? data.find(
                  (t) =>
                      t.id === selectedTournament.id ||
                      (!selectedTournament.slug && isLegacySelectionOf(selectedTournament, t))
              )
            : undefined;

        // Screens fetch as soon as anything is selected, and their query keys
        // don't name the tournament. Whatever they fetched under a selection
        // with another slug, or none (a saved pre-unification one, sent with
        // no tournament header), failed or belongs elsewhere, so fetch it again.
        const select = (tournament: Tournament) => {
            const slugChanged = tournament.slug !== selectedTournament?.slug;
            setSelectedTournament(tournament);
            if (slugChanged && selectedTournament) {
                queryClient.invalidateQueries({
                    predicate: (query) => query.queryKey[0] !== 'tournaments',
                });
            }
        };

        if (stored) {
            // Refresh the stored copy if the directory has moved on.
            if (JSON.stringify(stored) !== JSON.stringify(selectedTournament)) {
                select(stored);
            }
            return;
        }

        // Nothing selected, or the selection no longer exists: prefer a live
        // tournament, then an upcoming one, then whatever is first.
        const fallback =
            data.find((t) => t.status === 'LIVE') ||
            data.find((t) => t.status === 'UPCOMING') ||
            data[0];

        if (fallback) select(fallback);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, hydrated]);

    return { tournaments: data ?? [], isLoading };
};

/** Mount-only wrapper so the root layout can run the bootstrap. */
export const TournamentBootstrap = () => {
    useTournamentBootstrap();
    return null;
};
