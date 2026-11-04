// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@/types/auth';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  updateMobile: vi.fn(),
  pathname: '/home',
}));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/lib/api/auth', () => ({ authApi: { updateMobile: mocks.updateMobile } }));
vi.mock('@/lib/api/client', () => ({
  getErrorMessage: (e: Error) => e.message,
}));

import { MobileNumberGate, parseMobile } from '../MobileNumberGate';

const googleUser = { id: 'u1', mobile: null, auth_provider: 'google' } as User;
const updateUser = vi.fn();
const logout = vi.fn();

function signedInAs(user: User | null) {
  mocks.useAuth.mockReturnValue({ user, updateUser, logout });
}

function submit(value: string) {
  fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Save & Continue' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = '/home';
});
afterEach(cleanup);

describe('parseMobile', () => {
  it('keeps the digits of a 10-digit number', () => {
    expect(parseMobile(' 98765 43210 ')).toEqual({ digits: '9876543210' });
  });

  it('refuses a country code, as the signup form does', () => {
    expect(parseMobile('+919876543210')).toHaveProperty('error');
    expect(parseMobile('00919876543210')).toHaveProperty('error');
  });

  it('refuses anything that is not ten digits', () => {
    expect(parseMobile('98765')).toHaveProperty('error');
    expect(parseMobile('919876543210')).toHaveProperty('error');
  });
});

describe('MobileNumberGate', () => {
  it('asks a signed-in account that has no number', () => {
    signedInAs(googleUser);
    render(<MobileNumberGate />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('stays away when signed out or when the account has a number', () => {
    signedInAs(null);
    const { rerender } = render(<MobileNumberGate />);
    expect(screen.queryByRole('dialog')).toBeNull();

    signedInAs({ ...googleUser, mobile: '9876543210' });
    rerender(<MobileNumberGate />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not cover the Google sign-in popup', () => {
    mocks.pathname = '/auth/google-relay';
    signedInAs(googleUser);
    render(<MobileNumberGate />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('saves the digits and hands the updated account to the session', async () => {
    const updated = { ...googleUser, mobile: '9876543210' };
    mocks.updateMobile.mockResolvedValue(updated);
    signedInAs(googleUser);
    render(<MobileNumberGate />);

    submit('98765 43210');

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(updated));
    expect(mocks.updateMobile).toHaveBeenCalledWith('9876543210');
  });

  it('does not call the server for a number it can already refuse', () => {
    signedInAs(googleUser);
    render(<MobileNumberGate />);

    submit('123');

    expect(mocks.updateMobile).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid 10-digit mobile number')).toBeTruthy();
  });

  it('shows why the server refused and lets them try again', async () => {
    mocks.updateMobile.mockRejectedValue(
      new Error('This mobile number is already linked to another account'),
    );
    signedInAs(googleUser);
    render(<MobileNumberGate />);

    submit('9876543210');

    await screen.findByText('This mobile number is already linked to another account');
    expect(updateUser).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Save & Continue' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('offers signing out instead', () => {
    signedInAs(googleUser);
    render(<MobileNumberGate />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out instead' }));

    expect(logout).toHaveBeenCalled();
  });
});
