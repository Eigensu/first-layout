import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageKeys } from '../../lib/storage';
import { queryClient } from '../../lib/queryClient';
import { userService, DeleteAccountCredential } from '../../services/userService';

interface AuthState {
    // State
    token: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;

    // Actions
    login: (token: string, refreshToken?: string) => void;
    logout: () => void;
    updateToken: (token: string) => void;
    updateTokens: (token: string, refreshToken?: string) => void;
    deleteAccount: (credential: DeleteAccountCredential, reason?: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            // Initial state
            token: null,
            refreshToken: null,
            isAuthenticated: false,

            // Login: Update state (persist middleware handles storage)
            login: (token: string, refreshToken?: string) => {
                set({
                    token,
                    refreshToken,
                    isAuthenticated: true,
                });
            },

            // Logout: clear auth state, and every cached query (profile incl.
            // isAdmin, teams, wallet, enrollments...) with it — otherwise the
            // previous account's data, including admin access, stays visible
            // to whatever guest or account uses the app next. The selected
            // tournament is browsing context, not a credential — the app is
            // publicly browsable and every API call needs one, so it outlives
            // the session and the login screen shows which one you're signing
            // in to.
            //
            // Only clear the query cache when there was actually a session to
            // end: the api-client's 401 interceptor calls logout() on every
            // unauthorized response, including the profile fetch a guest
            // fires with no token. Clearing unconditionally turned each of
            // those into a fresh cache wipe, which re-triggered the same
            // request, the same 401, and the same logout() call — a refetch
            // storm on every guest screen.
            logout: () => {
                const wasAuthenticated = get().isAuthenticated;
                set({
                    token: null,
                    refreshToken: null,
                    isAuthenticated: false,
                });
                if (wasAuthenticated) {
                    queryClient.clear();
                }
            },

            // Update token: For refresh scenarios
            updateToken: (token: string) => {
                set((state) => ({
                    ...state,
                    token,
                }));
            },

            // Update both tokens after a refresh. The backend rotates refresh
            // tokens, so the one that was just spent must be replaced. When
            // the response carries no new one, the stored one is kept.
            updateTokens: (token: string, refreshToken?: string) => {
                set((state) => ({
                    ...state,
                    token,
                    refreshToken: refreshToken ?? state.refreshToken,
                }));
            },

            // Delete account: Soft delete and logout only on success
            deleteAccount: async (credential: DeleteAccountCredential, reason?: string) => {
                // Call the API - this will throw if the credential is wrong
                await userService.deleteAccount(credential, reason);

                // Only clear auth state if deletion was successful (no error thrown)
                set({
                    token: null,
                    refreshToken: null,
                    isAuthenticated: false,
                });
                queryClient.clear();
            },
        }),
        {
            name: StorageKeys.AUTH_TOKEN,
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
