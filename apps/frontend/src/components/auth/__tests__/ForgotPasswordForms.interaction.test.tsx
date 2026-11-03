// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';

const api = vi.hoisted(() => ({
  getResetChannels: vi.fn(),
  requestResetCode: vi.fn(),
  verifyResetCode: vi.fn(),
}));
vi.mock('@/lib/api/emailCodes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/emailCodes')>()),
  ...api,
}));

const nav = vi.hoisted(() => ({ push: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import ForgotPasswordRequestPage from '@/app/auth/forgot-password/page';
import ForgotPasswordVerifyPage from '@/app/auth/forgot-password/verify/page';
import { ForgotPasswordRequestForm } from '../ForgotPasswordRequestForm';
import { ForgotPasswordVerifyForm } from '../ForgotPasswordVerifyForm';

function httpError(status: number, detail: unknown) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { detail },
  } as AxiosResponse);
}

beforeEach(() => {
  vi.resetAllMocks();
  nav.params = new URLSearchParams();
});

afterEach(() => {
  cleanup();
});

describe('asking for a code', () => {
  it('switches to email and sends the code there', async () => {
    api.requestResetCode.mockResolvedValueOnce(undefined);
    const onSent = vi.fn();
    render(<ForgotPasswordRequestForm channels={{ sms: true, email: true }} onSent={onSent} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Email' }));
    expect(screen.getByRole('radio', { name: 'Email' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.change(screen.getByPlaceholderText('The email on your account'), {
      target: { value: 'rahul@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));

    await waitFor(() =>
      expect(onSent).toHaveBeenCalledWith('/auth/forgot-password/verify?email=rahul%40example.com'),
    );
    expect(api.requestResetCode).toHaveBeenCalledWith({ email: 'rahul@example.com' });
  });

  it('shows why the code was not sent, and stays on the page', async () => {
    api.requestResetCode.mockRejectedValueOnce(
      httpError(503, {
        code: 'channel_unavailable',
        message: "Password reset by mobile number isn't available right now.",
      }),
    );
    const onSent = vi.fn();
    render(<ForgotPasswordRequestForm channels={{ sms: true, email: false }} onSent={onSent} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. +91XXXXXXXXXX'), {
      target: { value: '9876543210' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Get OTP via Call' }));

    expect(
      await screen.findByText("Password reset by mobile number isn't available right now."),
    ).toBeTruthy();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('opens on the channels the backend offers and moves on to verify', async () => {
    api.getResetChannels.mockResolvedValueOnce({ sms: false, email: true });
    api.requestResetCode.mockResolvedValueOnce(undefined);
    render(<ForgotPasswordRequestPage />);

    expect(screen.getByText('Loading…')).toBeTruthy();
    fireEvent.change(await screen.findByPlaceholderText('The email on your account'), {
      target: { value: 'rahul@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));

    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith('/auth/forgot-password/verify?email=rahul%40example.com'),
    );
  });
});

describe('entering the code', () => {
  it('trades the code for a reset token', async () => {
    api.verifyResetCode.mockResolvedValueOnce('tok');
    const onVerified = vi.fn();
    render(
      <ForgotPasswordVerifyForm destination={{ phone: '9876543210' }} onVerified={onVerified} />,
    );

    fireEvent.change(screen.getByPlaceholderText('Enter OTP'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith('/auth/forgot-password/reset?token=tok'));
    expect(api.verifyResetCode).toHaveBeenCalledWith({ phone: '9876543210' }, '123456');
  });

  it('reports a wrong code', async () => {
    api.verifyResetCode.mockRejectedValueOnce(httpError(400, 'Invalid or expired OTP'));
    const onVerified = vi.fn();
    render(
      <ForgotPasswordVerifyForm
        destination={{ email: 'rahul@example.com' }}
        onVerified={onVerified}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('Invalid or expired OTP')).toBeTruthy();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('reads where the code went from the address bar', async () => {
    nav.params = new URLSearchParams('email=rahul%40example.com');
    api.verifyResetCode.mockResolvedValueOnce('tok');
    render(<ForgotPasswordVerifyPage />);

    expect(await screen.findByText(/emailed you/)).toBeTruthy();
    expect(screen.getByDisplayValue('rahul@example.com')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/auth/forgot-password/reset?token=tok'));
  });
});
