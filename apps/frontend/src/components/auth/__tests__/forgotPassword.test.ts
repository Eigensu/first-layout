import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/emailCodes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/emailCodes')>();
  return { ...actual, requestResetCode: vi.fn(), verifyResetCode: vi.fn() };
});

import { requestResetCode, verifyResetCode } from '@/lib/api/emailCodes';
import {
  checkResetCode,
  requestButtonLabel,
  sendResetCode,
  verifyPrompt,
} from '../forgotPassword';

const request = vi.mocked(requestResetCode);
const verify = vi.mocked(verifyResetCode);

afterEach(() => {
  vi.clearAllMocks();
});

function axiosError(status: number, detail: unknown) {
  return { isAxiosError: true, message: 'Request failed', response: { status, data: { detail } } };
}

describe('sendResetCode', () => {
  it('goes on to the verify page carrying the address', async () => {
    request.mockResolvedValueOnce(undefined);

    const result = await sendResetCode('email', ' rahul@example.com ');

    expect(request).toHaveBeenCalledWith({ email: 'rahul@example.com' });
    expect(result).toEqual({
      ok: true,
      next: '/auth/forgot-password/verify?email=rahul%40example.com',
    });
  });

  it('sends a number as the phone, as the site always has', async () => {
    request.mockResolvedValueOnce(undefined);

    await sendResetCode('sms', '9876543210');

    expect(request).toHaveBeenCalledWith({ phone: '9876543210' });
  });

  it('stays put and says why when the backend refuses', async () => {
    request.mockRejectedValueOnce(
      axiosError(429, { code: 'rate_limited', message: 'Too many attempts. Please try again in 5 minutes.' }),
    );

    await expect(sendResetCode('sms', '9876543210')).resolves.toEqual({
      ok: false,
      error: 'Too many attempts. Please try again in 5 minutes.',
    });
  });
});

describe('checkResetCode', () => {
  it('goes on to set the password with the token', async () => {
    verify.mockResolvedValueOnce('tok/en');

    await expect(checkResetCode({ email: 'rahul@example.com' }, '482913')).resolves.toEqual({
      ok: true,
      next: '/auth/forgot-password/reset?token=tok%2Fen',
    });
    expect(verify).toHaveBeenCalledWith({ email: 'rahul@example.com' }, '482913');
  });

  it('reports a wrong code', async () => {
    verify.mockRejectedValueOnce(axiosError(400, 'Invalid or expired OTP'));

    await expect(checkResetCode({ phone: '9876543210' }, '000000')).resolves.toEqual({
      ok: false,
      error: 'Invalid or expired OTP',
    });
  });
});

describe('wording', () => {
  it('labels the button for the channel', () => {
    expect(requestButtonLabel('email', false)).toBe('Email me a code');
    expect(requestButtonLabel('email', true)).toBe('Sending…');
    expect(requestButtonLabel('sms', false)).toBe('Get OTP via Call');
    expect(requestButtonLabel('sms', true)).toBe('Requesting Call...');
  });

  it('prompts for the code where it was sent', () => {
    expect(verifyPrompt('email')).toContain('emailed you');
    expect(verifyPrompt('sms')).toBe('Enter the OTP received via call');
  });
});
