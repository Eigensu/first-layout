import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ del: vi.fn() }));

vi.mock('../lib/api-client', () => ({ api: { delete: h.del } }));
vi.mock('../config/apiConfig', () => ({ buildApiUrl: (p: string) => `http://backend.test${p}` }));

import { userService } from './userService';

const body = () => h.del.mock.calls[0][1].data;

const rejection = (status: number, detail?: unknown) =>
    Object.assign(new Error('Request failed'), { response: { status, data: { detail } } });

beforeEach(() => {
    h.del.mockReset();
    h.del.mockResolvedValue({ data: {} });
});

describe('userService.deleteAccount', () => {
    it('sends the password for a password account', async () => {
        await userService.deleteAccount({ password: 'hunter22' }, 'leaving');

        expect(h.del.mock.calls[0][0]).toBe('/api/users/me');
        expect(body()).toEqual({
            password: 'hunter22',
            google_id_token: undefined,
            apple_identity_token: undefined,
            reason: 'leaving',
        });
    });

    it('sends only the Google token for a Google account, with no password', async () => {
        await userService.deleteAccount({ googleIdToken: 'g-token' });

        expect(body().google_id_token).toBe('g-token');
        expect(body().password).toBeUndefined();
        expect(body().apple_identity_token).toBeUndefined();
    });

    it('sends only the Apple identity token for an Apple account, with no password', async () => {
        await userService.deleteAccount({ appleIdentityToken: 'a-token' });

        expect(body().apple_identity_token).toBe('a-token');
        expect(body().password).toBeUndefined();
        expect(body().google_id_token).toBeUndefined();
    });

    it("shows the backend's reason when a provider token is refused", async () => {
        h.del.mockRejectedValue(rejection(401, 'Google account does not match this user'));

        await expect(userService.deleteAccount({ googleIdToken: 'g' })).rejects.toMatchObject({
            message: 'Google account does not match this user',
            status: 401,
        });
    });

    it('still says "Incorrect password" for a refused password with no detail', async () => {
        h.del.mockRejectedValue(rejection(401));

        await expect(userService.deleteAccount({ password: 'nope' })).rejects.toMatchObject({
            message: 'Incorrect password',
            status: 401,
        });
    });

    it('does not blame a password when a provider token is refused with no detail', async () => {
        h.del.mockRejectedValue(rejection(401));

        await expect(userService.deleteAccount({ appleIdentityToken: 'a' })).rejects.toThrow(
            'Could not confirm your identity'
        );
    });
});
