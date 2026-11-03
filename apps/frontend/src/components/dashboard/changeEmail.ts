import {
  codeErrorMessage,
  confirmEmailChange,
  requestEmailChange,
} from '@/lib/api/emailCodes';
import type { User } from '@/types/auth';

/**
 * Changing the email on a profile: the code goes to the new address, and
 * nothing changes until it comes back (docs/UNIFIED_AUTH_SPEC.md §5.7).
 */

export type ChangeEmailState =
  | { step: 'form' }
  | { step: 'code'; email: string; expiresInSec: number }
  | { step: 'done'; email: string };

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Only what is worth catching before a round trip; the backend decides.
 * One "@", something before it, and a dot inside the part after it. Written
 * without a regular expression, whose obvious form backtracks badly.
 */
function looksLikeEmail(value: string): boolean {
  if (/\s/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  const dot = domain.lastIndexOf('.');
  return local.length > 0 && dot > 0 && dot < domain.length - 1;
}

export function emailChangeProblem(
  email: string,
  password: string,
  currentEmail?: string | null,
): string | null {
  const value = email.trim().toLowerCase();
  if (!looksLikeEmail(value)) return 'Enter a valid email address.';
  if (value === currentEmail?.trim().toLowerCase()) {
    return 'That is already your email.';
  }
  if (!password) return 'Enter your current password.';
  return null;
}

export async function startEmailChange(
  email: string,
  password: string,
  currentEmail?: string | null,
): Promise<Outcome<ChangeEmailState>> {
  const problem = emailChangeProblem(email, password, currentEmail);
  if (problem) return { ok: false, error: problem };
  try {
    const started = await requestEmailChange(email, password);
    return {
      ok: true,
      value: { step: 'code', email: started.email, expiresInSec: started.expires_in_sec },
    };
  } catch (error) {
    return { ok: false, error: codeErrorMessage(error) };
  }
}

export async function finishEmailChange(otp: string): Promise<Outcome<User>> {
  if (!otp.trim()) return { ok: false, error: 'Enter the code from the email.' };
  try {
    return { ok: true, value: await confirmEmailChange(otp) };
  } catch (error) {
    return { ok: false, error: codeErrorMessage(error) };
  }
}

/**
 * Accounts created with Google or Apple may have no password, and changing
 * the email asks for one. Setting one through "Forgot password" is the way in.
 */
export function passwordHint(authProvider?: string): string | null {
  if (!authProvider || authProvider === 'password') return null;
  return 'Signed up with Google or Apple and never set a password? Set one with "Forgot password" on the sign-in page first.';
}

export function minutes(seconds: number): string {
  const n = Math.max(1, Math.round(seconds / 60));
  return n === 1 ? '1 minute' : `${n} minutes`;
}
