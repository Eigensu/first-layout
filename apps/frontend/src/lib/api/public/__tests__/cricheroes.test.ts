import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import apiClient from '../../client';
import { publicCricHeroesApi, type CachedTable, type MvpRow } from '../cricheroes';

let sent: InternalAxiosRequestConfig[] = [];
let reply: unknown = {};
const original = apiClient.defaults.adapter;

beforeEach(() => {
  // A tournament's own site: the client names it in X-Tournament-Slug.
  vi.stubGlobal('window', { location: { host: 'tpl.wallearena.com' } });
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

describe('public CricHeroes stats', () => {
  it.each([
    ['pointTable', '/api/cricheroes/point-table'],
    ['mvp', '/api/cricheroes/mvp'],
    ['battingLeaderboard', '/api/cricheroes/batting-leaderboard'],
    ['bowlingLeaderboard', '/api/cricheroes/bowling-leaderboard'],
  ] as const)('%s reads %s for the site’s tournament', async (call, url) => {
    reply = { linked: false, fetched_at: null, rows: [] };

    expect(await publicCricHeroesApi[call]()).toEqual(reply);
    expect(sent[0].method).toBe('get');
    expect(sent[0].url).toBe(url);
    expect(sent[0].headers['X-Tournament-Slug']).toBe('tpl');
    // Nothing that could pick another tournament, cached or not.
    expect(sent[0].params).toBeUndefined();
  });

  it('passes the table through as the backend sent it', async () => {
    const table: CachedTable<MvpRow> = {
      linked: true,
      fetched_at: '2026-11-05T15:30:00+05:30',
      rows: [{ player_id: 1, name: 'Shakib Al Hasan', total: '94.183', rank: 1 }],
    };
    reply = table;

    expect(await publicCricHeroesApi.mvp()).toEqual(table);
  });
});
