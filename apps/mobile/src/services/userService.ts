import { api } from '../lib/api-client';
import { buildApiUrl } from '../config/apiConfig';
import {
    UserProfile,
    WalletBalance,
    UserProfileSchema,
    WalletBalanceSchema,
} from '../types/user';

/**
 * Resolve the user's real avatar, or nothing at all.
 *
 * Google sign-in supplies a genuine profile picture, and an uploaded avatar
 * lives in GridFS — which comes back as the relative path
 * "/api/users/<id>/avatar". That relative form is not a URL: UserProfileSchema's
 * .url() check rejects it, failing the whole parse, and React Native's <Image>
 * couldn't load it either, so point it at the active tournament's API.
 *
 * When there is no avatar this returns undefined rather than inventing one.
 * Showing a stranger's photo from a placeholder service in place of a person's
 * face is worse than showing no photo; callers fall back to their initial.
 */
const resolveAvatarUrl = (rawUrl: string | null | undefined): string | undefined => {
    if (!rawUrl) return undefined;
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
    return buildApiUrl(rawUrl);
};

/** Map a backend user payload onto the app's UserProfile shape. */
const toUserProfile = (userData: any): UserProfile => {
    // Safely handle datetime field - convert invalid dates to current date
    let createdAt: string | undefined;
    try {
        if (userData.created_at) {
            // Try to parse the datetime
            const date = new Date(userData.created_at);
            if (isNaN(date.getTime())) {
                // Invalid date, use current date
                createdAt = new Date().toISOString();
            } else {
                createdAt = date.toISOString();
            }
        }
    } catch {
        // If parsing fails, use current date
        createdAt = new Date().toISOString();
    }

    return UserProfileSchema.parse({
        id: userData.id,
        email: userData.email,
        name: userData.full_name || userData.username,
        mobile: userData.mobile ?? null,
        authProvider: userData.auth_provider || 'password',
        avatarUrl: resolveAvatarUrl(userData.avatar_url),
        createdAt: createdAt,
        isAdmin: userData.is_admin || false,
    });
};

/** How the person deleting their account proves it is them. */
export type DeleteAccountCredential =
    | { password: string }
    | { googleIdToken: string }
    | { appleIdentityToken: string };

export const userService = {
    /**
     * Fetch current user profile
     */
    getProfile: async (): Promise<UserProfile> => {
        try {
            const response = await api.get('/api/users/me');
            return toUserProfile(response.data);
        } catch (error: any) {
            // If it's a 401 error, let the interceptor handle it
            if (error.response?.status === 401) {
                throw error;
            }

            // Create a more user-friendly error message
            const userFriendlyError = new Error('Unable to load profile. Please try again.');
            (userFriendlyError as any).originalError = error;
            throw userFriendlyError;
        }
    },

    /**
     * Fetch user wallet balance and transactions
     */
    getWallet: async (): Promise<WalletBalance> => {
        // TODO: Replace with actual API call
        // const response = await api.get<WalletBalance>('/wallet');
        // return WalletBalanceSchema.parse(response.data);

        // MOCK DATA
        return new Promise<WalletBalance>((resolve) =>
            setTimeout(() => {
                const mockData = {
                    currency: 'USD',
                    amount: 1250.5,
                    transactions: [
                        {
                            id: '1',
                            amount: 100,
                            type: 'credit' as const,
                            description: 'Arena win bonus',
                            date: new Date(Date.now() - 86400000).toISOString(),
                        },
                        {
                            id: '2',
                            amount: -50,
                            type: 'debit' as const,
                            description: 'Arena entry fee',
                            date: new Date(Date.now() - 172800000).toISOString(),
                        },
                    ],
                };
                resolve(WalletBalanceSchema.parse(mockData));
            }, 1200)
        );
    },

    /**
     * Update the signed-in user's profile (name / mobile)
     */
    updateProfile: async (profileData: Partial<UserProfile>): Promise<UserProfile> => {
        try {
            const payload: Record<string, string> = {};
            if (profileData.name !== undefined) payload.full_name = profileData.name;
            if (profileData.mobile != null) payload.mobile = profileData.mobile;

            const response = await api.patch('/api/users/me', payload);
            return toUserProfile(response.data);
        } catch (error: any) {
            const status = error.response?.status;
            if (status === 404 || status === 405) {
                // Older tournament backends predate PATCH /api/users/me. Tagged
                // so callers can fall through instead of blaming the user.
                const unsupported = new Error(
                    "This tournament's server can't save your details yet."
                );
                (unsupported as any).code = 'UNSUPPORTED';
                throw unsupported;
            }
            if (status === 409) {
                throw new Error('This mobile number is already linked to another account');
            }
            if (status === 422) {
                throw new Error('Please enter a valid mobile number (10-15 digits)');
            }
            if (!error.response) {
                throw new Error('Network error. Please check your connection and try again.');
            }
            throw new Error(
                error.response?.data?.detail || 'Could not save your details. Please try again.'
            );
        }
    },

    /**
     * Delete user account (soft delete)
     *
     * What proves the owner is present depends on the account: a password, or
     * for accounts made with Google or Apple (which have none) a fresh token
     * from that provider.
     */
    deleteAccount: async (credential: DeleteAccountCredential, reason?: string): Promise<void> => {
        try {
            await api.delete('/api/users/me', {
                data: {
                    password: 'password' in credential ? credential.password : undefined,
                    google_id_token: 'googleIdToken' in credential ? credential.googleIdToken : undefined,
                    apple_identity_token:
                        'appleIdentityToken' in credential ? credential.appleIdentityToken : undefined,
                    reason,
                },
            });
        } catch (error: any) {
            // Handle specific error codes with user-friendly messages
            const status = error.response?.status;
            if (status === 401) {
                // The backend says which check failed ("Google account does not
                // match this user", "Re-authenticate with Apple to ..."), which
                // beats guessing it was a password.
                const detail = error.response?.data?.detail;
                const authError = new Error(
                    typeof detail === 'string' && detail
                        ? detail
                        : 'password' in credential
                          ? 'Incorrect password'
                          : 'Could not confirm your identity. Please try again.'
                );
                (authError as any).status = 401;
                throw authError;
            }
            if (status === 403) {
                const forbiddenError = new Error('Account is already deactivated');
                (forbiddenError as any).status = 403;
                throw forbiddenError;
            }
            if (status === 404) {
                const notFoundError = new Error('Account not found');
                (notFoundError as any).status = 404;
                throw notFoundError;
            }
            if (status === 422) {
                const validationError = new Error('Invalid request. Please check your details.');
                (validationError as any).status = 422;
                throw validationError;
            }
            if (status === 502 || status === 503 || status === 504) {
                const serverError = new Error('Server is temporarily unavailable. Please try again.');
                (serverError as any).status = status;
                throw serverError;
            }
            if (status >= 500) {
                const serverError = new Error('Server error. Please try again later.');
                (serverError as any).status = status;
                throw serverError;
            }
            throw error;
        }
    },
};
