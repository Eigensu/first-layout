import { describe, expect, it } from 'vitest';
import {
  GOOGLE_RELAY_MESSAGE,
  getAllowedOpenerOrigin,
  getGoogleRelayOrigin,
  isRelayMessage,
  isRelayState,
  newRelayState,
  relayUrl,
} from '../googleRelay';

const APEX = 'https://wallearena.com';

describe('getGoogleRelayOrigin', () => {
  it('sends a tournament subdomain to the apex', () => {
    expect(getGoogleRelayOrigin('https://rspl.wallearena.com', '')).toBe(APEX);
    expect(getGoogleRelayOrigin('https://some-new-cup.wallearena.com', '')).toBe(APEX);
  });

  it('lets the apex, previews and localhost render Google directly', () => {
    expect(getGoogleRelayOrigin(APEX, '')).toBeNull();
    expect(getGoogleRelayOrigin('https://walle-web.vercel.app', '')).toBeNull();
    expect(getGoogleRelayOrigin('http://localhost:3000', '')).toBeNull();
  });

  it('uses the configured relay, but not on the relay itself', () => {
    expect(getGoogleRelayOrigin('http://rspl.localhost:3000', 'http://localhost:3000')).toBe(
      'http://localhost:3000',
    );
    expect(getGoogleRelayOrigin('http://localhost:3000', 'http://localhost:3000/')).toBeNull();
  });
});

describe('getAllowedOpenerOrigin', () => {
  it('accepts a tournament subdomain of the relay', () => {
    expect(getAllowedOpenerOrigin('https://rspl.wallearena.com', APEX)).toBe(
      'https://rspl.wallearena.com',
    );
    expect(getAllowedOpenerOrigin('http://dcpl.localhost:3000', 'http://localhost:3000')).toBe(
      'http://dcpl.localhost:3000',
    );
  });

  it.each([
    ['nothing', null],
    ['another site', 'https://evil.example.com'],
    ['a lookalike suffix', 'https://rspl.wallearena.com.evil.example.com'],
    ['a lookalike domain', 'https://rsplwallearena.com'],
    ['plain http', 'http://rspl.wallearena.com'],
    ['another port', 'https://rspl.wallearena.com:8443'],
    ['a path', 'https://rspl.wallearena.com/auth/login'],
    ['a trailing slash', 'https://rspl.wallearena.com/'],
    ['credentials', 'https://user@rspl.wallearena.com'],
    ['a nested label', 'https://a.rspl.wallearena.com'],
    ['www', 'https://www.wallearena.com'],
    ['a reserved name', 'https://admin.wallearena.com'],
    ['a backend host', 'https://api-lpcl.wallearena.com'],
    ['the relay itself', APEX],
    ['localhost from production', 'http://rspl.localhost:3000'],
    ['a localhost tournament over https', 'https://rspl.localhost'],
    ['an opaque origin', 'null'],
    ['a script URL', 'javascript:alert(1)'],
  ])('refuses %s', (_label, target) => {
    expect(getAllowedOpenerOrigin(target, APEX)).toBeNull();
  });

  it('refuses a production tournament from a local relay', () => {
    expect(
      getAllowedOpenerOrigin('http://rspl.wallearena.com:3000', 'http://localhost:3000'),
    ).toBeNull();
  });
});

describe('relay state and messages', () => {
  it('makes a fresh state that the relay accepts', () => {
    const a = newRelayState();
    expect(isRelayState(a)).toBe(true);
    expect(newRelayState()).not.toBe(a);
  });

  it('refuses a missing, short or odd state', () => {
    expect(isRelayState(null)).toBe(false);
    expect(isRelayState('abc')).toBe(false);
    expect(isRelayState('a'.repeat(20) + '<')).toBe(false);
  });

  it('matches only its own message for this state', () => {
    const state = newRelayState();
    const ok = { type: GOOGLE_RELAY_MESSAGE, idToken: 'token', state };
    expect(isRelayMessage(ok, state)).toBe(true);
    expect(isRelayMessage({ ...ok, state: newRelayState() }, state)).toBe(false);
    expect(isRelayMessage({ ...ok, type: 'other' }, state)).toBe(false);
    expect(isRelayMessage({ ...ok, idToken: '' }, state)).toBe(false);
    expect(isRelayMessage('token', state)).toBe(false);
    expect(isRelayMessage(null, state)).toBe(false);
  });

  it('builds the relay URL with the page origin and state', () => {
    const url = new URL(relayUrl(APEX, 'https://rspl.wallearena.com', 'abc'));
    expect(url.origin + url.pathname).toBe(`${APEX}/auth/google-relay`);
    expect(url.searchParams.get('origin')).toBe('https://rspl.wallearena.com');
    expect(url.searchParams.get('state')).toBe('abc');
  });
});
