import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys for type safety
export const StorageKeys = {
    AUTH_TOKEN: 'auth_token',
    USER_DATA: 'user_data',
    THEME_PREFERENCE: 'theme_preference',
} as const;

// AsyncStorage adapter with MMKV-like synchronous interface for Zustand persist
export const storage = {
    getString: (key: string): string | undefined => {
        return undefined; // Zustand persist handles async
    },
    set: (key: string, value: string): void => {
        AsyncStorage.setItem(key, value);
    },
    getBoolean: (key: string): boolean | undefined => {
        return undefined; // Zustand persist handles async
    },
    delete: (key: string): void => {
        AsyncStorage.removeItem(key);
    },
    clearAll: (): void => {
        AsyncStorage.clear();
    },
};

// Helper functions
export const storageHelpers = {
    getString: (key: string) => storage.getString(key),
    setString: (key: string, value: string) => storage.set(key, value),
    getBoolean: (key: string) => storage.getBoolean(key),
    setBoolean: (key: string, value: boolean) => storage.set(key, value.toString()),
    delete: (key: string) => storage.delete(key),
    clearAll: () => storage.clearAll(),
};
