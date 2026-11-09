// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { User } from '@/types/auth';

const api = vi.hoisted(() => ({
  requestEmailChange: vi.fn(),
  confirmEmailChange: vi.fn(),
}));
vi.mock('@/lib/api/emailCodes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/emailCodes')>()),
  ...api,
}));

import { ChangeEmailSection } from '../ChangeEmailSection';

const updated = { id: 'u1', email: 'new@example.com' } as User;

function httpError(status: number, detail: string) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { detail },
  } as AxiosResponse);
}

function open(onChanged = vi.fn()) {
  render(
    <ChangeEmailSection
      currentEmail="old@example.com"
      authProvider="password"
      onChanged={onChanged}
    />,
  );
  return onChanged;
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function sendCode() {
  api.requestEmailChange.mockResolvedValueOnce({ email: 'new@example.com', expires_in_sec: 600 });
  fill('New Email', 'new@example.com');
  fill('Current Password', 'Secret123');
  fireEvent.click(screen.getByRole('button', { name: 'Send Code' }));
  await screen.findByText(/We sent a code to/);
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('changing the email', () => {
  it('sends a code to the new address, then commits it', async () => {
    const onChanged = open();
    await sendCode();
    expect(api.requestEmailChange).toHaveBeenCalledWith('new@example.com', 'Secret123');

    api.confirmEmailChange.mockResolvedValueOnce(updated);
    fill('Code', '482913');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Email' }));

    expect(await screen.findByText(/Your email is now/)).toBeTruthy();
    expect(api.confirmEmailChange).toHaveBeenCalledWith('482913');
    expect(onChanged).toHaveBeenCalledWith(updated);

    fireEvent.click(screen.getByRole('button', { name: 'Change it again' }));
    expect(screen.getByRole('button', { name: 'Send Code' })).toBeTruthy();
  });

  it('shows why the code was not sent', async () => {
    api.requestEmailChange.mockRejectedValueOnce(
      httpError(409, 'This email is already linked to another account'),
    );
    open();

    fill('New Email', 'taken@example.com');
    fill('Current Password', 'Secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Send Code' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'This email is already linked to another account',
    );
  });

  it('keeps the code step open on a wrong code', async () => {
    const onChanged = open();
    await sendCode();

    api.confirmEmailChange.mockRejectedValueOnce(httpError(400, 'Invalid or expired code'));
    fill('Code', '000000');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Email' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Invalid or expired code');
    expect(screen.getByRole('button', { name: 'Confirm Email' })).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('goes back to the form to use a different address', async () => {
    open();
    await sendCode();

    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Send Code' })).toBeTruthy());
  });
});
