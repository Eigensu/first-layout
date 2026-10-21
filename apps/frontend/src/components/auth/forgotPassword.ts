import {
  codeErrorMessage,
  destinationToQuery,
  requestResetCode,
  resetDestination,
  verifyResetCode,
  type ResetChannel,
  type ResetDestination,
} from '@/lib/api/emailCodes';

/** The forgot-password steps, apart from the pages that show them. */

export type StepResult = { ok: true; next: string } | { ok: false; error: string };

export const CHANNEL_LABELS: Record<ResetChannel, string> = {
  sms: 'Mobile',
  email: 'Email',
};

/** Where to go once the code is on its way. */
export async function sendResetCode(channel: ResetChannel, value: string): Promise<StepResult> {
  const destination = resetDestination(channel, value);
  try {
    // The answer is the same whether or not an account matches, so only a
    // refusal (rate limit, channel unavailable) stops the flow here.
    await requestResetCode(destination);
    return { ok: true, next: `/auth/forgot-password/verify?${destinationToQuery(destination)}` };
  } catch (error) {
    return { ok: false, error: codeErrorMessage(error) };
  }
}

/** Where to go once the code checks out: the page that sets the password. */
export async function checkResetCode(
  destination: ResetDestination,
  otp: string,
): Promise<StepResult> {
  try {
    const token = await verifyResetCode(destination, otp);
    return { ok: true, next: `/auth/forgot-password/reset?${new URLSearchParams({ token })}` };
  } catch (error) {
    return { ok: false, error: codeErrorMessage(error) };
  }
}

export function requestButtonLabel(channel: ResetChannel, loading: boolean): string {
  if (channel === 'email') return loading ? 'Sending…' : 'Email me a code';
  return loading ? 'Requesting Call...' : 'Get OTP via Call';
}

export function verifyPrompt(channel: ResetChannel): string {
  return channel === 'email'
    ? "Enter the code we emailed you. Check spam if it isn't there."
    : 'Enter the OTP received via call';
}
