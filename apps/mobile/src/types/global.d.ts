// Global type declarations for React Native/Expo

declare const __DEV__: boolean;

declare namespace NodeJS {
    interface ProcessEnv {
        EXPO_PUBLIC_API_BASE_URL?: string;
    }
}