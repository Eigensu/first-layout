// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { Tournament } from '@/lib/api/admin/tournaments';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  checkSlug: vi.fn(),
  archive: vi.fn(),
  hardDelete: vi.fn(),
}));
vi.mock('@/lib/api/admin/tournaments', () => ({ adminTournamentsApi: api }));

import { TournamentsSection } from '../TournamentsSection';

const gsl = {
  id: 't1',
  slug: 'gsl',
  name: 'GSL',
  status: 'live',
  cricheroes_tournament_id: null,
  created_at: '2026-11-01T00:00:00+05:30',
  updated_at: '2026-11-01T00:00:00+05:30',
} as Tournament;

function httpError(status: number, detail: string) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { detail },
  } as AxiosResponse);
}

/** Open GSL's edit form, type a CricHeroes id into it and press Save. */
async function linkGsl(id: string) {
  render(<TournamentsSection />);
  fireEvent.click(await screen.findByRole('button', { name: /Edit/ }));
  fireEvent.change(screen.getByLabelText('CricHeroes Tournament'), {
    target: { value: id },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  api.list.mockResolvedValue({ tournaments: [gsl], total: 1, page: 1, page_size: 50 });
});

afterEach(cleanup);

describe('linking a CricHeroes tournament', () => {
  it('sends the id, then closes and reloads the list when CricHeroes confirmed it', async () => {
    api.update.mockResolvedValue({ ...gsl, cricheroes_tournament_id: 2251924 });

    await linkGsl('2251924');

    await waitFor(() => expect(screen.queryByText('Edit GSL')).toBeNull());
    expect(api.update).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ cricheroes_tournament_id: 2251924 })
    );
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('refuses an id outside the CricHeroes agreement and keeps the form open', async () => {
    api.update.mockRejectedValue(
      httpError(422, 'Not linked. CricHeroes do not give us access to this tournament.')
    );

    await linkGsl('60214');

    expect(await screen.findByText(/Not linked\. CricHeroes do not give us access/)).toBeTruthy();
    expect(screen.getByText('Edit GSL')).toBeTruthy();
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('shows what is unconfirmed when the link saved but CricHeroes could not be asked', async () => {
    api.update.mockResolvedValue({
      ...gsl,
      cricheroes_tournament_id: 2251924,
      cricheroes_warning:
        'Linked, but CricHeroes could not confirm they serve tournament 2251924 to us: HTTP 500.',
    });

    await linkGsl('2251924');

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('Saved.');
    expect(notice.textContent).toContain('could not confirm they serve tournament 2251924');
    // Still open, so it can be read; the list reloads only on Close.
    expect(screen.getByText('Saved GSL')).toBeTruthy();
    expect(api.list).toHaveBeenCalledTimes(1);
    // Already saved: nothing more can be typed, or sent again.
    const field = screen.getByLabelText('CricHeroes Tournament') as HTMLInputElement;
    expect(field.closest('fieldset')?.disabled).toBe(true);
    fireEvent.submit(field.closest('form')!);
    expect(api.update).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Close'));

    await waitFor(() => expect(screen.queryByText('Saved GSL')).toBeNull());
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('reloads the list however a saved-with-a-warning form is dismissed', async () => {
    api.update.mockResolvedValue({
      ...gsl,
      cricheroes_tournament_id: 2251924,
      cricheroes_warning: 'Linked, but CricHeroes could not confirm they serve it.',
    });

    await linkGsl('2251924');
    await screen.findByRole('status');

    // The header's X, not the footer's button: the tournament is already saved.
    fireEvent.click(screen.getByLabelText('Close'));

    await waitFor(() => expect(screen.queryByText('Saved GSL')).toBeNull());
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('discards an edit that was not saved when the header X is pressed', async () => {
    render(<TournamentsSection />);
    fireEvent.click(await screen.findByRole('button', { name: /Edit/ }));

    fireEvent.click(screen.getByLabelText('Close'));

    await waitFor(() => expect(screen.queryByText('Edit GSL')).toBeNull());
    expect(api.update).not.toHaveBeenCalled();
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('no longer tells an admin to configure the sync', async () => {
    render(<TournamentsSection />);
    fireEvent.click(await screen.findByRole('button', { name: /Edit/ }));

    const help = screen.getByLabelText('CricHeroes Tournament').getAttribute('aria-describedby');
    const text = document.getElementById(help ?? '')?.textContent ?? '';

    expect(text).not.toContain('CRICHEROES_SYNC_TOURNAMENT_IDS');
    expect(text).toContain('Checked with CricHeroes when you save');
  });
});
