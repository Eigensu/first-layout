import { beforeEach, describe, expect, it, vi } from 'vitest';

// The backend rotates refresh tokens: each is good for one use and is revoked
// when spent. These tests run the real response interceptor against a fake
// backend that behaves that way.

const h = vi.hoisted(() => {
    const state = {
        token: 'access-0' as string | null,
        refreshToken: 'refresh-0' as string | null,
        isAuthenticated: true,
        logouts: 0,
        updateTokens(token: string, refreshToken?: string) {
            state.token = token;
            state.refreshToken = refreshToken ?? state.refreshToken;
        },
        logout() {
            state.logouts += 1;
            state.token = null;
            state.refreshToken = null;
            state.isAuthenticated = false;
        },
    };
    return { state, refreshToken: vi.fn() };
});

vi.mock('../core/store/authStore', () => ({
    useAuthStore: {
        getState: () => h.state,
        persist: { hasHydrated: () => true, onFinishHydration: () => () => {} },
    },
}));
vi.mock('../core/store/tournamentStore', () => ({
    useTournamentStore: { getState: () => ({ selectedTournament: { slug: 't' } }) },
}));
vi.mock('../config/apiConfig', () => ({
    TENANT_HEADER: 'X-Tournament-Slug',
    getCurrentApiEndpoint: () => 'http://backend.test',
}));
vi.mock('../common/constants', () => ({ API_TIMEOUT: 1000 }));
vi.mock('../utils/apiError', () => ({ apiErrorMessage: () => '' }));
vi.mock('../services/authService', () => ({
    authService: { refreshToken: h.refreshToken },
}));

import { api } from './api-client';

// --- fake backend -----------------------------------------------------------

let validRefresh: Set<string>;
let validAccess: string;
let generation: number;
let refreshCalls: string[];
let apiCalls: number;

const rotate = () => {
    generation += 1;
    validAccess = `access-${generation}`;
    validRefresh.add(`refresh-${generation}`);
    return { access_token: validAccess, refresh_token: `refresh-${generation}`, token_type: 'bearer' };
};

const rejected = (message: string, status?: number) =>
    Object.assign(new Error(message), status ? { status } : { code: 'NETWORK_ERROR' });

api.defaults.adapter = async (config) => {
    apiCalls += 1;
    const status = config.headers?.Authorization === `Bearer ${validAccess}` ? 200 : 401;
    const response = { data: {}, status, statusText: '', headers: {}, config };
    if (status === 401) {
        throw Object.assign(new Error('401'), { isAxiosError: true, config, response });
    }
    return response;
};

beforeEach(() => {
    h.state.token = 'access-0';
    h.state.refreshToken = 'refresh-0';
    h.state.isAuthenticated = true;
    h.state.logouts = 0;
    validRefresh = new Set(['refresh-0']);
    validAccess = 'access-0';
    generation = 0;
    refreshCalls = [];
    apiCalls = 0;
    h.refreshToken.mockReset();
    h.refreshToken.mockImplementation(async (token: string) => {
        refreshCalls.push(token);
        await Promise.resolve();
        if (!validRefresh.delete(token)) throw rejected('revoked', 401);
        return rotate();
    });
});

const expireAccessToken = () => {
    h.state.token = 'expired';
};

// --- tests ------------------------------------------------------------------

describe('token refresh', () => {
    it('refreshes once when several requests fail with 401 together', async () => {
        expireAccessToken();

        const results = await Promise.allSettled([
            api.get('/api/a'),
            api.get('/api/b'),
            api.get('/api/c'),
        ]);

        expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
        expect(refreshCalls).toEqual(['refresh-0']);
        expect(h.state.logouts).toBe(0);
    });

    it('stores the rotated refresh token and uses it for the next expiry', async () => {
        expireAccessToken();
        await api.get('/api/a');
        expect(h.state.refreshToken).toBe('refresh-1');

        expireAccessToken();
        await api.get('/api/b');

        expect(refreshCalls).toEqual(['refresh-0', 'refresh-1']);
        expect(h.state.refreshToken).toBe('refresh-2');
        expect(h.state.logouts).toBe(0);
    });

    it('resends a request that went out with an older token without refreshing again', async () => {
        expireAccessToken();
        const late = api.get('/api/late');
        // Fails after the refresh has already completed for another request.
        await api.get('/api/first');
        await late;

        expect(refreshCalls).toHaveLength(1);
        expect(h.state.logouts).toBe(0);
    });

    it('keeps the session when the refresh fails because the device is offline', async () => {
        expireAccessToken();
        h.refreshToken.mockRejectedValueOnce(rejected('offline'));

        await expect(api.get('/api/a')).rejects.toThrow('offline');

        expect(h.state.logouts).toBe(0);
        expect(h.state.refreshToken).toBe('refresh-0');
    });

    it('logs out once when the refresh token is rejected', async () => {
        expireAccessToken();
        h.state.refreshToken = 'revoked';

        const results = await Promise.allSettled([api.get('/api/a'), api.get('/api/b')]);

        expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
        expect(refreshCalls).toEqual(['revoked']);
        expect(h.state.logouts).toBe(1);
    });

    it('does not restore tokens when the user logs out while a refresh is in flight', async () => {
        expireAccessToken();
        let release!: () => void;
        h.refreshToken.mockImplementationOnce(async (token: string) => {
            refreshCalls.push(token);
            await new Promise<void>((resolve) => (release = resolve));
            validRefresh.delete(token);
            return rotate();
        });

        const pending = api.get('/api/a');
        await vi.waitFor(() => expect(refreshCalls).toHaveLength(1));
        h.state.logout();
        release();

        await expect(pending).rejects.toThrow('Session changed');
        expect(h.state.token).toBeNull();
        expect(h.state.refreshToken).toBeNull();
        expect(h.state.isAuthenticated).toBe(false);
    });

    it('leaves a new sign-in alone when a refresh for the previous session fails', async () => {
        expireAccessToken();
        let fail!: () => void;
        h.refreshToken.mockImplementationOnce(async (token: string) => {
            refreshCalls.push(token);
            await new Promise<void>((_, reject) => (fail = () => reject(rejected('revoked', 401))));
            throw new Error('unreachable');
        });

        const pending = api.get('/api/a');
        await vi.waitFor(() => expect(refreshCalls).toHaveLength(1));
        // Another account signs in while the old refresh is still pending.
        h.state.token = 'new-user-access';
        h.state.refreshToken = 'new-user-refresh';
        h.state.logouts = 0;
        fail();

        await expect(pending).rejects.toThrow();
        expect(h.state.logouts).toBe(0);
        expect(h.state.token).toBe('new-user-access');
        expect(h.state.refreshToken).toBe('new-user-refresh');
    });
});
