import axios from 'axios';
import apiClient, { getErrorMessage } from './client';
import type { User } from '@/types/auth';

/**
 * Codes sent by SMS or email: password reset, and changing the account's
 * email (docs/UNIFIED_AUTH_SPEC.md §5.5, §5.7).
 */

export type ResetChannel = 'sms' | 'email';

export type ResetChannels = Record<ResetChannel, boolean>;

/** The backend takes exactly one of these. */
export type ResetDestination = { phone: string } | { email: string };

// What a backend from before the email channel offered: SMS, with no way to
// ask. The website can deploy ahead of the backend, so a failed lookup has to
// fall back to the flow that already worked.
export const LEGACY_CHANNELS: ResetChannels = { sms: true, email: false };

export async function getResetChannels(): Promise<ResetChannels> {
  try {
    const { data } = await apiClient.get<ResetChannels>('/api/auth/forgot-password/channels');
    return { sms: Boolean(data?.sms), email: Boolean(data?.email) };
  } catch {
    return LEGACY_CHANNELS;
  }
}

/** The channel to show first: SMS when it works, as it always has been. */
export function defaultChannel(channels: ResetChannels): ResetChannel | null {
  if (channels.sms) return 'sms';
  if (channels.email) return 'email';
  return null;
}

export function resetDestination(channel: ResetChannel, value: string): ResetDestination {
  const trimmed = value.trim();
  return channel === 'email' ? { email: trimmed } : { phone: trimmed };
}

export function destinationChannel(destination: ResetDestination): ResetChannel {
  return 'email' in destination ? 'email' : 'sms';
}

export function destinationValue(destination: ResetDestination): string {
  return 'email' in destination ? destination.email : destination.phone;
}

/** Carried from the request page to the verify page in the query string. */
export function destinationToQuery(destination: ResetDestination): string {
  return new URLSearchParams(destination as Record<string, string>).toString();
}

export function destinationFromQuery(params: {
  get(name: string): string | null;
}): ResetDestination | null {
  const email = params.get('email');
  if (email) return { email };
  const phone = params.get('phone');
  if (phone) return { phone };
  return null;
}

export async function requestResetCode(destination: ResetDestination): Promise<void> {
  await apiClient.post('/api/auth/forgot-password/request', destination);
}

export async function verifyResetCode(
  destination: ResetDestination,
  otp: string,
): Promise<string> {
  const { data } = await apiClient.post<{ reset_token: string }>(
    '/api/auth/forgot-password/verify',
    { ...destination, otp: otp.trim() },
  );
  return data.reset_token;
}

export type EmailChangeStarted = { email: string; expires_in_sec: number };

export async function requestEmailChange(
  email: string,
  password: string,
): Promise<EmailChangeStarted> {
  const { data } = await apiClient.post<EmailChangeStarted>('/api/users/me/email/request', {
    email: email.trim(),
    password,
  });
  return data;
}

export async function confirmEmailChange(otp: string): Promise<User> {
  const { data } = await apiClient.post<User>('/api/users/me/email/verify', {
    otp: otp.trim(),
  });
  return data;
}

/**
 * The backend's own sentence where it sent one.
 *
 * getErrorMessage turns every 5xx into "Server error", which would hide the
 * two these routes answer on purpose: 503 when a channel is not set up here
 * ("use your mobile number instead") and 502 when a code could not be sent.
 */
export function codeErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail: unknown = (error.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (detail && typeof detail === 'object') {
      const message = (detail as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
    if (!error.response) return 'Network error. Check your connection and try again.';
  }
  return getErrorMessage(error);
}
