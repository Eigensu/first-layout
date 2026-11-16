import { api } from '../lib/api-client';
import { TENANT_HEADER } from '../config/apiConfig';
import type { CarouselResponse } from '../types/carousel';
import { cache, CACHE_KEYS } from '../utils/storage';
import { Image } from 'react-native';

const CACHE_TTL_MINUTES = 30; // Cache for 30 minutes

// Preload images into memory
const preloadImages = (imageUrls: string[]) => {
    imageUrls.forEach(url => {
        if (url) {
            Image.prefetch(url).catch(() => {
                // Silently fail - image will load on demand
            });
        }
    });
};

export const carouselService = {
    getCarouselImages: async (slug: string, forceRefresh: boolean = false): Promise<CarouselResponse> => {
        const cacheKey = CACHE_KEYS.CAROUSEL_IMAGES(slug);

        // Check cache first (unless force refresh)
        if (!forceRefresh) {
            const cached = await cache.get<CarouselResponse>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        try {
            const response = await api.get('/api/v1/carousel/', {
                // Named here rather than left to whatever is selected when the
                // request leaves, so what's cached under this slug is its own.
                headers: { [TENANT_HEADER]: slug },
                params: {
                    active: true,
                    page: 1,
                    page_size: 10
                }
            });

            const data: CarouselResponse = response.data;

            // Cache the response
            await cache.set(cacheKey, data, CACHE_TTL_MINUTES);

            // Preload images in background
            const imageUrls = data.images
                .filter(img => img.image_url)
                .map(img => img.image_url as string);
            preloadImages(imageUrls);

            return data;
        } catch (error) {
            // Try to return stale cache on error
            const staleCache = await cache.get<CarouselResponse>(cacheKey);
            if (staleCache) {
                return staleCache;
            }

            // Return empty carousel when API is not available
            console.warn('Carousel API not available');
            return {
                images: [],
                total: 0,
                page: 1,
                page_size: 10
            };
        }
    },

    // Force refresh from API
    refreshCarouselImages: async (slug: string): Promise<CarouselResponse> => {
        return carouselService.getCarouselImages(slug, true);
    },

    // Clear carousel cache
    clearCache: async (slug: string) => {
        await cache.remove(CACHE_KEYS.CAROUSEL_IMAGES(slug));
    },
};
