// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../GoogleSignInButton', () => ({
  GoogleSignInButton: ({ onCredential }: { onCredential: (t: string) => void }) => (
    <button onClick={() => onCredential('id-token')}>google</button>
  ),
}));

import { GoogleRelay } from '../GoogleRelay';

const RSPL = 'https://rspl.wallearena.com';
const STATE = 'a'.repeat(32);

function setPage(url: string) {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);
}

function setOpener(opener: unknown) {
  Object.defineProperty(window, 'opener', { value: opener, configurable: true, writable: true });
}

let opener: { closed: boolean; postMessage: ReturnType<typeof vi.fn> };

beforeEach(() => {
  setPage('https://wallearena.com/auth/google-relay');
  opener = { closed: false, postMessage: vi.fn() };
  setOpener(opener);
});

afterEach(() => {
  cleanup();
  setOpener(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('posts the token to the tournament page that opened it, then closes', () => {
  vi.useFakeTimers();
  const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  render(<GoogleRelay origin={RSPL} state={STATE} />);
  expect(screen.getByText('rspl.wallearena.com')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'google' }));

  expect(opener.postMessage).toHaveBeenCalledWith(
    { type: 'google-relay-token', idToken: 'id-token', state: STATE },
    RSPL,
  );
  vi.advanceTimersByTime(200);
  expect(close).toHaveBeenCalled();
});

it('says so when the page that opened it has gone', () => {
  setOpener(null);
  render(<GoogleRelay origin={RSPL} state={STATE} />);

  fireEvent.click(screen.getByRole('button', { name: 'google' }));

  expect(screen.getByRole('alert').textContent).toContain('has closed');
});

describe('refuses to relay', () => {
  it.each([
    ['to another site', 'https://evil.example.com', STATE],
    ['with no origin', null, STATE],
    ['with no state', RSPL, null],
    ['with a short state', RSPL, 'abc'],
  ])('%s', (_label, origin, state) => {
    render(<GoogleRelay origin={origin} state={state} />);

    expect(screen.getByText('Nothing to sign in to')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'google' })).toBeNull();
  });

  it('from a host that is not registered with Google', () => {
    setPage(`${RSPL}/auth/google-relay`);
    render(<GoogleRelay origin="https://dcpl.wallearena.com" state={STATE} />);

    expect(screen.getByText('Nothing to sign in to')).toBeTruthy();
  });
});
