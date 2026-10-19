import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { TENANT_HEADER, tenantHeaders } from '@/common/consts';
import apiClient from '../client';

function onHost(host: string) {
  vi.stubGlobal('window', { location: { host } });
  vi.stubGlobal('localStorage', { getItem: () => null });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tenantHeaders', () => {
  it('names the tournament a subdomain serves', () => {
    onHost('dcpl.wallearena.com');
    expect(tenantHeaders()).toEqual({ [TENANT_HEADER]: 'dcpl' });
  });

  it('works for local development on <slug>.localhost', () => {
    onHost('rspl.localhost:3000');
    expect(tenantHeaders()).toEqual({ [TENANT_HEADER]: 'rspl' });
  });

  it.each(['wallearena.com', 'www.wallearena.com', 'api-lpcl.wallearena.com', 'localhost:3000'])(
    'sends nothing from %s, which is not a tournament',
    (host) => {
      onHost(host);
      expect(tenantHeaders()).toEqual({});
    },
  );

  it('sends nothing while rendering on the server', () => {
    expect(typeof window).toBe('undefined');
    expect(tenantHeaders()).toEqual({});
  });
});

describe('apiClient', () => {
  async function sentHeaders() {
    let seen: InternalAxiosRequestConfig | undefined;
    await apiClient.get('/api/contests', {
      adapter: async (config) => {
        seen = config;
        return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
      },
    });
    return seen!.headers;
  }

  it('tells the backend which tournament every request belongs to', async () => {
    onHost('dcpl.wallearena.com');
    expect((await sentHeaders())[TENANT_HEADER]).toBe('dcpl');
  });

  it('sends no tournament from the apex', async () => {
    onHost('wallearena.com');
    expect((await sentHeaders())[TENANT_HEADER]).toBeUndefined();
  });
});
