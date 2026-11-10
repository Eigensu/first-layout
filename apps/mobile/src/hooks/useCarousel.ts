import { skipToken, useQuery } from '@tanstack/react-query';
import { carouselService } from '../services/carouselService';
import { useTournamentStore } from '../core/store/tournamentStore';
import { useImageUrl } from './useApiEndpoint';
import type { NewsItem } from '../components/home/NewsCarousel';

/**
 * Fetches the remote carousel feed and maps it to NewsCarousel items.
 *
 * The underlying service already falls back to stale cache (and then an empty
 * list) when the API is unavailable, so an empty `items` array here is the
 * signal for the carousel to render its static placeholder content. The same
 * goes for while nothing is selected, since a carousel belongs to a tournament.
 */
export function useCarousel(): { items: NewsItem[]; isLoading: boolean } {
  const { buildImageUrl } = useImageUrl();
  const slug = useTournamentStore((state) => state.selectedTournament?.slug);

  const { data, isLoading } = useQuery({
    queryKey: ['carousel', slug],
    queryFn: slug ? () => carouselService.getCarouselImages(slug) : skipToken,
    staleTime: 1000 * 60 * 5,
  });

  const items: NewsItem[] = (data?.images ?? [])
    .filter((img) => img.active)
    .sort((a, b) => a.display_order - b.display_order)
    .map((img) => ({
      id: img.id ?? img._id ?? '',
      title: img.title ?? '',
      subtitle: img.subtitle ?? '',
      imageUrl: img.image_url ? buildImageUrl(img.image_url) ?? undefined : undefined,
      linkUrl: img.link_url,
    }));

  return { items, isLoading };
}
