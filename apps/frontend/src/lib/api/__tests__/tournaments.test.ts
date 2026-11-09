import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { TENANT_HEADER } from '@/common/consts';
import apiClient from '../client';
import { getMyTournaments, type MyTournaments } from '../tournaments';
import {
  formatPoints,
  tournamentLink,
} from '@/components/profile/myTournaments';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const played = {
  slug: 'rspl',
  name: 'Rspl',
  logo_url: null,
  status: 'live' as const,
  display_name: 'rahul',
  joined_at: '2026-10-01T09:00:00+05:30',
  first_played_at: '2026-10-01T09:30:00+05:30',
  last_active_at: '2026-10-05T18:00:00+05:30',
  teams_count: 3,
  contests_count: 2,
  best_rank: 14,
  total_points: 812.5,
};

describe('getMyTournaments', () => {
  it('reads the profile list, naming the tournament the page is on', async () => {
    vi.stubGlobal('window', { location: { host: 'dcpl.wallearena.com' } });
    vi.stubGlobal('localStorage', { getItem: () => null });
    const body: MyTournaments = { played: [played], registered_only: [] };
    let seen: InternalAxiosRequestConfig | undefined;
    const original = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      seen = config;
      return { data: body, status: 200, statusText: 'OK', headers: {}, config };
    };
    try {
      await expect(getMyTournaments()).resolves.toEqual(body);
    } finally {
      apiClient.defaults.adapter = original;
    }
    expect(seen!.url).toBe('/api/users/me/tournaments');
    expect(seen!.headers[TENANT_HEADER]).toBe('dcpl');
  });
});

describe('tournamentLink', () => {
  it('opens another tournament on its own subdomain', () => {
    expect(tournamentLink(played, 'dcpl')).toBe('https://rspl.wallearena.com');
  });

  it('does not link the site already open', () => {
    expect(tournamentLink(played, 'rspl')).toBeNull();
  });

  it('does not link an archived tournament, whose site is gone', () => {
    expect(tournamentLink({ ...played, status: 'archived' }, null)).toBeNull();
  });
});

describe('formatPoints', () => {
  it.each([
    [143.95000000000002, '144'],
    [137.85, '137.9'],
    [812.5, '812.5'],
    [1234.25, '1,234.3'],
    [0, '0'],
  ])('shows %s as %s', (points, shown) => {
    expect(formatPoints(points)).toBe(shown);
  });
});
