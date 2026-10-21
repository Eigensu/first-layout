// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { Tournament, TournamentAdmin } from '@/lib/api/admin/tournaments';

const api = vi.hoisted(() => ({
  listAdmins: vi.fn(),
  appointAdmin: vi.fn(),
  removeAdmin: vi.fn(),
}));
vi.mock('@/lib/api/admin/tournaments', () => ({ adminTournamentsApi: api }));

import { TournamentAdminsDialog } from '../TournamentAdminsDialog';

const tournament = { id: 't1', name: 'Alpha League' } as Tournament;
const admin = (user_id: string, name: string): TournamentAdmin => ({
  user_id,
  username: name.toLowerCase(),
  full_name: name,
  email: `${name.toLowerCase()}@example.com`,
  display_name: name.toLowerCase(),
});
const asha = admin('u1', 'Asha');
const zara = admin('u2', 'Zara');

function httpError(status: number, detail: string) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { detail },
  } as AxiosResponse);
}

function open(onClose = vi.fn()) {
  render(<TournamentAdminsDialog tournament={tournament} onClose={onClose} />);
  return onClose;
}

function appoint(identifier: string) {
  fireEvent.change(screen.getByLabelText('Mobile number or email of the new admin'), {
    target: { value: identifier },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Make admin' }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TournamentAdminsDialog', () => {
  it('loads the tournament’s admins when it opens', async () => {
    api.listAdmins.mockResolvedValue([asha]);
    open();

    expect(await screen.findByText('Asha')).toBeTruthy();
    expect(api.listAdmins).toHaveBeenCalledWith('t1');
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
  });

  it('appoints someone, then shows them in the list', async () => {
    api.listAdmins.mockResolvedValueOnce([]).mockResolvedValueOnce([asha]);
    api.appointAdmin.mockResolvedValue(asha);
    open();
    await screen.findByText(/No admins yet/);

    appoint('  9876543210 ');

    expect(await screen.findByText('Asha')).toBeTruthy();
    expect(api.appointAdmin).toHaveBeenCalledWith('t1', '9876543210');
    const input = screen.getByLabelText(
      'Mobile number or email of the new admin',
    ) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('says plainly when no account signs in that way', async () => {
    api.listAdmins.mockResolvedValue([]);
    api.appointAdmin.mockRejectedValue(
      httpError(404, 'No account signs in with that mobile number, email or username'),
    );
    open();

    appoint('nobody@example.com');

    expect(
      await screen.findByText('No account signs in with that mobile number, email or username'),
    ).toBeTruthy();
  });

  it('passes on what the backend says about a shared username', async () => {
    api.listAdmins.mockResolvedValue([]);
    api.appointAdmin.mockRejectedValue(
      httpError(409, 'That username belongs to more than one account.'),
    );
    open();

    appoint('asha');

    expect(await screen.findByText('That username belongs to more than one account.')).toBeTruthy();
  });

  it('shows why the list could not load', async () => {
    api.listAdmins.mockRejectedValue(httpError(409, 'Tournament admins are appointed on the shared backend only.'));
    open();

    expect(
      await screen.findByText('Tournament admins are appointed on the shared backend only.'),
    ).toBeTruthy();
  });

  it('removes an admin once confirmed', async () => {
    vi.stubGlobal('confirm', () => true);
    api.listAdmins.mockResolvedValueOnce([asha, zara]).mockResolvedValueOnce([zara]);
    api.removeAdmin.mockResolvedValue({ message: 'ok' });
    open();
    await screen.findByText('Asha');

    fireEvent.click(screen.getAllByRole('button', { name: /Remove/ })[0]);

    await waitFor(() => expect(screen.queryByText('Asha')).toBeNull());
    expect(api.removeAdmin).toHaveBeenCalledWith('t1', 'u1');
    expect(screen.getByText('Zara')).toBeTruthy();
  });

  it('removes nobody when the confirmation is cancelled', async () => {
    vi.stubGlobal('confirm', () => false);
    api.listAdmins.mockResolvedValue([asha]);
    open();
    await screen.findByText('Asha');

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));

    expect(api.removeAdmin).not.toHaveBeenCalled();
  });

  it('ignores a slower, older list that arrives last', async () => {
    let finishFirst: (admins: TournamentAdmin[]) => void = () => {};
    api.listAdmins
      .mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce([zara]);
    api.appointAdmin.mockResolvedValue(zara);
    open();

    appoint('zara@example.com');
    expect(await screen.findByText('Zara')).toBeTruthy();
    finishFirst([asha]);

    await waitFor(() => expect(api.listAdmins).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Asha')).toBeNull();
    expect(screen.getByText('Zara')).toBeTruthy();
  });

  it('closes on Escape', async () => {
    api.listAdmins.mockResolvedValue([]);
    const onClose = open();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps Tab inside the dialog', async () => {
    api.listAdmins.mockResolvedValue([asha]);
    open();
    await screen.findByText('Asha');
    const close = screen.getByRole('button', { name: 'Close' });
    const remove = screen.getByRole('button', { name: /Remove/ });

    remove.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(remove);
  });
});
