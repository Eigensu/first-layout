import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client')>();
  return { ...actual, default: { get: vi.fn(), post: vi.fn() } };
});

import apiClient from '../client';
import {
  LEGACY_CHANNELS,
  codeErrorMessage,
  confirmEmailChange,
  defaultChannel,
  destinationChannel,
  destinationFromQuery,
  destinationToQuery,
  destinationValue,
  getResetChannels,
  requestEmailChange,
  requestResetCode,
  resetDestination,
  verifyResetCode,
} from '../emailCodes';

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);

afterEach(() => {
  vi.clearAllMocks();
});

function axiosError(status: number | null, data?: unknown) {
  return {
    isAxiosError: true,
    message: 'Request failed',
    response: status === null ? undefined : { status, data },
  };
}

describe('getResetChannels', () => {
  it('reports what the backend says it can send on', async () => {
    get.mockResolvedValueOnce({ data: { sms: false, email: true } });

    await expect(getResetChannels()).resolves.toEqual({ sms: false, email: true });
    expect(get).toHaveBeenCalledWith('/api/auth/forgot-password/channels');
  });

  it('falls back to SMS alone when the backend predates the question', async () => {
    get.mockRejectedValueOnce(axiosError(404, { detail: 'Not Found' }));

    await expect(getResetChannels()).resolves.toEqual(LEGACY_CHANNELS);
  });
});

describe('defaultChannel', () => {
  it('opens on SMS when it works, as it always has', () => {
    expect(defaultChannel({ sms: true, email: true })).toBe('sms');
  });

  it('opens on email when that is all there is', () => {
    expect(defaultChannel({ sms: false, email: true })).toBe('email');
  });

  it('has nothing to open when neither works', () => {
    expect(defaultChannel({ sms: false, email: false })).toBeNull();
  });
});

describe('destinations', () => {
  it('sends a phone or an email, never both', () => {
    expect(resetDestination('sms', ' +91 98765 43210 ')).toEqual({ phone: '+91 98765 43210' });
    expect(resetDestination('email', ' rahul@example.com ')).toEqual({
      email: 'rahul@example.com',
    });
  });

  it('carries the destination from the request page to the verify page', () => {
    for (const destination of [{ phone: '+91 98765 43210' }, { email: 'rahul@example.com' }]) {
      const query = new URLSearchParams(destinationToQuery(destination));
      expect(destinationFromQuery(query)).toEqual(destination);
    }
  });

  it('reads nothing from a query that names no destination', () => {
    expect(destinationFromQuery(new URLSearchParams(''))).toBeNull();
  });

  it('names the channel and the value of a destination', () => {
    expect(destinationChannel({ email: 'a@example.com' })).toBe('email');
    expect(destinationChannel({ phone: '9876543210' })).toBe('sms');
    expect(destinationValue({ email: 'a@example.com' })).toBe('a@example.com');
    expect(destinationValue({ phone: '9876543210' })).toBe('9876543210');
  });
});

describe('the reset calls', () => {
  it('requests a code for the destination as given', async () => {
    post.mockResolvedValueOnce({ data: { message: 'ok' } });

    await requestResetCode({ email: 'rahul@example.com' });

    expect(post).toHaveBeenCalledWith('/api/auth/forgot-password/request', {
      email: 'rahul@example.com',
    });
  });

  it('trades the code for a reset token', async () => {
    post.mockResolvedValueOnce({ data: { reset_token: 'tok', expires_in_sec: 600 } });

    await expect(verifyResetCode({ phone: '9876543210' }, ' 123456 ')).resolves.toBe('tok');
    expect(post).toHaveBeenCalledWith('/api/auth/forgot-password/verify', {
      phone: '9876543210',
      otp: '123456',
    });
  });
});

describe('the email-change calls', () => {
  it('asks for a code at the new address, with the password', async () => {
    post.mockResolvedValueOnce({ data: { email: 'new@example.com', expires_in_sec: 600 } });

    await expect(requestEmailChange(' new@example.com ', 'Secret123')).resolves.toEqual({
      email: 'new@example.com',
      expires_in_sec: 600,
    });
    expect(post).toHaveBeenCalledWith('/api/users/me/email/request', {
      email: 'new@example.com',
      password: 'Secret123',
    });
  });

  it('confirms with the code and returns the updated account', async () => {
    const user = { id: 'u1', email: 'new@example.com' };
    post.mockResolvedValueOnce({ data: user });

    await expect(confirmEmailChange(' 482913 ')).resolves.toEqual(user);
    expect(post).toHaveBeenCalledWith('/api/users/me/email/verify', { otp: '482913' });
  });
});

describe('codeErrorMessage', () => {
  it("shows a 503's own sentence instead of a generic server error", () => {
    const error = axiosError(503, {
      detail: {
        code: 'channel_unavailable',
        message: "Password reset by email isn't available right now. Use your mobile number instead.",
      },
    });

    expect(codeErrorMessage(error)).toBe(
      "Password reset by email isn't available right now. Use your mobile number instead.",
    );
  });

  it('shows a plain string detail', () => {
    expect(codeErrorMessage(axiosError(400, { detail: 'Invalid or expired OTP' }))).toBe(
      'Invalid or expired OTP',
    );
  });

  it('says so when the request never reached the server', () => {
    expect(codeErrorMessage(axiosError(null))).toBe(
      'Network error. Check your connection and try again.',
    );
  });

  it('falls back to the shared messages otherwise', () => {
    expect(codeErrorMessage(axiosError(500, 'Internal Server Error'))).toBe(
      'Server error. Please try again later.',
    );
    expect(codeErrorMessage(new Error('boom'))).toBe('boom');
  });
});
