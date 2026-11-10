import AsyncStorage from '@react-native-async-storage/async-storage';

// Cache with expiration support
export const cache = {
    set: async <T>(key: string, value: T, ttlMinutes: number = 60) => {
        const item = {
            value,
            expiry: Date.now() + ttlMinutes * 60 * 1000,
        };
        await AsyncStorage.setItem(key, JSON.stringify(item));
    },

    get: async <T>(key: string): Promise<T | null> => {
        const itemStr = await AsyncStorage.getItem(key);
        if (!itemStr) return null;

        try {
            const item = JSON.parse(itemStr);
            if (Date.now() > item.expiry) {
                await AsyncStorage.removeItem(key);
                return null;
            }
            return item.value as T;
        } catch {
            return null;
        }
    },

    remove: async (key: string) => {
        await AsyncStorage.removeItem(key);
    },

    clear: async () => {
        await AsyncStorage.clear();
    },
};

export const CACHE_KEYS = {
    // A carousel belongs to one tournament, so each gets its own entry.
    CAROUSEL_IMAGES: (slug: string) => `carousel_images:${slug}`,
} as const;
