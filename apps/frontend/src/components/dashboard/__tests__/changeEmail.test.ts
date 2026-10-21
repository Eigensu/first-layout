import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/emailCodes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/emailCodes')>();
  return { ...actual, requestEmailChange: vi.fn(), confirmEmailChange: vi.fn() };
});

import { confirmEmailChange, requestEmailChange } from '@/lib/api/emailCodes';
import {
  emailChangeProblem,
  finishEmailChange,
  minutes,
  passwordHint,
  startEmailChange,
} from '../changeEmail';

const request = vi.mocked(requestEmailChange);
const confirm = vi.mocked(confirmEmailChange);

afterEach(() => {
  vi.clearAllMocks();
});

function axiosError(status: number, detail: unknown) {
  return { isAxiosError: true, message: 'Request failed', response: { status, data: { detail } } };
}

describe('emailChangeProblem', () => {
  it('accepts a new address with a password', () => {
    expect(emailChangeProblem('new@example.com', 'Secret123', 'old@example.com')).toBeNull();
  });

  it('catches what is wrong before a round trip', () => {
    expect(emailChangeProblem('not-an-email', 'Secret123')).toBe('Enter a valid email address.');
    expect(emailChangeProblem(' OLD@example.com ', 'Secret123', 'old@example.com')).toBe(
      'That is already your email.',
    );
    expect(emailChangeProblem('new@example.com', '')).toBe('Enter your current password.');
  });
});

describe('startEmailChange', () => {
  it('moves to the code step for the address the backend will store', async () => {
    request.mockResolvedValueOnce({ email: 'new@example.com', expires_in_sec: 600 });

    await expect(startEmailChange('New@Example.com', 'Secret123', 'old@example.com')).resolves.toEqual({
      ok: true,
      value: { step: 'code', email: 'new@example.com', expiresInSec: 600 },
    });
    expect(request).toHaveBeenCalledWith('New@Example.com', 'Secret123');
  });

  it('sends nothing when the form is not ready', async () => {
    await expect(startEmailChange('new@example.com', '', null)).resolves.toEqual({
      ok: false,
      error: 'Enter your current password.',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("shows the backend's reason when it refuses", async () => {
    request.mockRejectedValueOnce(axiosError(409, 'This email is already linked to another account'));

    await expect(startEmailChange('taken@example.com', 'Secret123')).resolves.toEqual({
      ok: false,
      error: 'This email is already linked to another account',
    });
  });
});

describe('finishEmailChange', () => {
  it('returns the updated account', async () => {
    const user = { id: 'u1', email: 'new@example.com' } as never;
    confirm.mockResolvedValueOnce(user);

    await expect(finishEmailChange('482913')).resolves.toEqual({ ok: true, value: user });
  });

  it('asks for the code before sending anything', async () => {
    await expect(finishEmailChange('  ')).resolves.toEqual({
      ok: false,
      error: 'Enter the code from the email.',
    });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('reports a wrong code', async () => {
    confirm.mockRejectedValueOnce(axiosError(400, 'Invalid or expired code'));

    await expect(finishEmailChange('000000')).resolves.toEqual({
      ok: false,
      error: 'Invalid or expired code',
    });
  });
});

describe('helpers', () => {
  it('points accounts made with Google or Apple at setting a password', () => {
    expect(passwordHint('password')).toBeNull();
    expect(passwordHint(undefined)).toBeNull();
    expect(passwordHint('google')).toContain('Forgot password');
  });

  it('words the expiry in minutes', () => {
    expect(minutes(600)).toBe('10 minutes');
    expect(minutes(60)).toBe('1 minute');
    expect(minutes(5)).toBe('1 minute');
  });
});
