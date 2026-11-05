import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

function visit(host: string, path: string) {
  return middleware(new NextRequest(`https://${host}${path}`, { headers: { host } }));
}

describe('admin pages on the apex', () => {
  it.each(['/admin/carousel', '/admin/contests', '/admin/contests/abc?tab=1'])(
    'sends %s on wallearena.com to the registry, which is all the apex can manage',
    (path) => {
      const res = visit('wallearena.com', path);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://wallearena.com/admin');
    }
  );

  it('leaves /admin itself on the apex alone', () => {
    expect(visit('www.wallearena.com', '/admin').headers.get('location')).toBeNull();
  });

  it('leaves admin pages on a tournament subdomain alone', () => {
    expect(visit('dcpl.wallearena.com', '/admin/contests').headers.get('location')).toBeNull();
  });
});
