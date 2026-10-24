// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'test-client',
  NEXT_PUBLIC_GOOGLE_RELAY_ORIGIN: '',
}));
vi.mock('next/script', () => ({ default: () => null }));
vi.mock('next/image', () => ({ default: () => null }));

import { GoogleSignInButton } from '../GoogleSignInButton';

const APEX = 'https://wallearena.com';
const RSPL = 'https://rspl.wallearena.com';

function setPage(url: string) {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);
}

function fakePopup() {
  const popup = { closed: false, close: vi.fn(() => (popup.closed = true)) };
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  return popup;
}

function post(data: unknown, origin: string, source: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
}

function openedState() {
  const url = new URL(vi.mocked(window.open).mock.calls[0][0] as string);
  return { url, state: url.searchParams.get('state') as string };
}

beforeEach(() => {
  setPage(`${RSPL}/auth/login`);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('on a tournament subdomain', () => {
  it('opens the relay on the apex for this page', () => {
    fakePopup();
    render(<GoogleSignInButton onCredential={vi.fn()} text="signin_with" />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    const { url, state } = openedState();
    expect(url.origin + url.pathname).toBe(`${APEX}/auth/google-relay`);
    expect(url.searchParams.get('origin')).toBe(RSPL);
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    expect(vi.mocked(window.open).mock.calls[0][1]).toBe('google-relay');
  });

  it('takes the token only from its own popup, origin and state', () => {
    const popup = fakePopup();
    const onCredential = vi.fn();
    render(<GoogleSignInButton onCredential={onCredential} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    const { state } = openedState();
    const message = { type: 'google-relay-token', idToken: 'id-token', state };

    post(message, 'https://evil.example.com', popup);
    post(message, APEX, {});
    post({ ...message, state: 'f'.repeat(32) }, APEX, popup);
    post({ ...message, type: 'other' }, APEX, popup);
    expect(onCredential).not.toHaveBeenCalled();

    post(message, APEX, popup);
    post({ ...message, idToken: 'second' }, APEX, popup);
    expect(onCredential).toHaveBeenCalledTimes(1);
    expect(onCredential).toHaveBeenCalledWith('id-token');
  });

  it('says so when the browser blocks the popup', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    render(<GoogleSignInButton onCredential={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(screen.getByRole('alert').textContent).toContain('Allow pop-ups');
  });

  it('gives up once the popup is closed without signing in', () => {
    vi.useFakeTimers();
    const popup = fakePopup();
    const onCredential = vi.fn();
    render(<GoogleSignInButton onCredential={onCredential} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    const { state } = openedState();

    popup.closed = true;
    vi.advanceTimersByTime(600);
    post({ type: 'google-relay-token', idToken: 'late', state }, APEX, popup);

    expect(onCredential).not.toHaveBeenCalled();
  });

  it('closes its popup when the page goes away mid-sign-in', () => {
    const popup = fakePopup();
    const { unmount } = render(<GoogleSignInButton onCredential={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    unmount();

    expect(popup.close).toHaveBeenCalled();
  });
});

describe('on the apex', () => {
  it("renders Google's own button instead of the relay", () => {
    setPage(`${APEX}/auth/google-relay`);
    const open = vi.spyOn(window, 'open');
    render(<GoogleSignInButton onCredential={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});
