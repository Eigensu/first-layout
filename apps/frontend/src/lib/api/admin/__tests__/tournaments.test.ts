import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import apiClient from '../../client';
import { adminTournamentsApi, type TournamentAdmin } from '../tournaments';

const asha: TournamentAdmin = {
  user_id: 'u1',
  username: 'asha',
  full_name: 'Asha Rao',
  email: 'asha@example.com',
  display_name: 'asha',
};

let sent: InternalAxiosRequestConfig[] = [];
let reply: unknown = {};
const original = apiClient.defaults.adapter;

beforeEach(() => {
  vi.stubGlobal('window', { location: { host: 'wallearena.com' } });
  vi.stubGlobal('localStorage', { getItem: () => null });
  sent = [];
  apiClient.defaults.adapter = async (config) => {
    sent.push(config);
    return { data: reply, status: 200, statusText: 'OK', headers: {}, config };
  };
});

afterEach(() => {
  apiClient.defaults.adapter = original;
  vi.unstubAllGlobals();
});

describe('tournament admins', () => {
  it('lists a tournament’s admins', async () => {
    reply = { admins: [asha] };

    expect(await adminTournamentsApi.listAdmins('t1')).toEqual([asha]);
    expect(sent[0].method).toBe('get');
    expect(sent[0].url).toBe('/api/admin/tournaments/t1/admins');
  });

  it('appoints someone by whatever they sign in with', async () => {
    reply = asha;

    expect(await adminTournamentsApi.appointAdmin('t1', '9876543210')).toEqual(asha);
    expect(sent[0].method).toBe('post');
    expect(sent[0].url).toBe('/api/admin/tournaments/t1/admins');
    expect(JSON.parse(sent[0].data)).toEqual({ identifier: '9876543210' });
  });

  it('removes an admin by their user id', async () => {
    reply = { message: 'ok' };

    await adminTournamentsApi.removeAdmin('t1', 'u1');
    expect(sent[0].method).toBe('delete');
    expect(sent[0].url).toBe('/api/admin/tournaments/t1/admins/u1');
  });
});
