import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { tournamentUrl } from '@/common/consts';
import type {
  MyTournaments,
  PlayedTournament,
  RegisteredTournament,
} from '@/lib/api/tournaments';
import { MyTournamentsSection } from '../MyTournamentsSection';

afterEach(() => {
  vi.unstubAllGlobals();
});

const played: PlayedTournament = {
  slug: 'rspl',
  name: 'Rspl',
  logo_url: null,
  status: 'live',
  display_name: 'rahul',
  joined_at: '2026-10-01T09:00:00+05:30',
  first_played_at: '2026-10-01T09:30:00+05:30',
  last_active_at: '2026-10-05T18:00:00+05:30',
  teams_count: 3,
  contests_count: 2,
  best_rank: 14,
  total_points: 812.5,
};

const registered: RegisteredTournament = {
  slug: 'dcpl',
  name: 'Dcpl',
  logo_url: null,
  status: 'live',
  joined_at: '2026-09-20T10:00:00+05:30',
};

function render(tournaments: Partial<MyTournaments>, username = 'rahul') {
  const html = renderToStaticMarkup(
    <MyTournamentsSection
      tournaments={{ played: [], registered_only: [], ...tournaments }}
      username={username}
    />,
  );
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return { html, text };
}

function onSite(slug: string) {
  vi.stubGlobal('window', { location: { host: `${slug}.wallearena.com` } });
}

// The page shows dates in the viewer's time zone, and 09:00 in India is still
// the day before in the Americas, so the expected text is worked out the same
// way rather than written for one zone.
function localDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

describe('MyTournamentsSection', () => {
  it('renders nothing when the account has joined no tournaments', () => {
    expect(render({}).html).toBe('');
  });

  it("shows a played tournament's numbers, linking to it from another site", () => {
    onSite('dcpl');
    const { html, text } = render({ played: [played] });

    expect(text).toContain('Your Tournaments');
    expect(html).toContain(`href="${tournamentUrl('rspl')}"`);
    expect(text).toContain('live');
    expect(text).not.toContain('This site');
    expect(text).toContain('Teams: 3');
    expect(text).toContain('Contests: 2');
    expect(text).toContain('Best rank: #14');
    expect(text).toContain('Points: 812.5');
    expect(text).toContain(`Last played: ${localDate(played.last_active_at!)}`);
    expect(text).not.toContain('Played as');
  });

  it('marks the tournament whose site is open instead of linking to it', () => {
    onSite('rspl');
    const { html, text } = render({ played: [played] });

    expect(text).toContain('This site');
    expect(html).not.toContain('href=');
  });

  it('links every tournament when rendered on the server', () => {
    const { html, text } = render({ played: [played] });

    expect(html).toContain(`href="${tournamentUrl('rspl')}"`);
    expect(text).not.toContain('This site');
  });

  it('names the player as they appeared there when that differs', () => {
    expect(render({ played: [played] }, 'rahul_new').text).toContain(
      'Played as rahul',
    );
  });

  it('fills gaps: no rank yet, never active, and a logo or its initial', () => {
    const fresh = {
      ...played,
      logo_url: 'https://cdn.example.com/rspl.png',
      best_rank: null,
      last_active_at: null,
    };
    const unnamed = {
      ...played,
      slug: 'mwpl',
      name: 'mwpl',
      joined_at: '',
      last_active_at: null,
    };
    const { html, text } = render({ played: [fresh, unnamed] });

    expect(text).toContain('Best rank: N/A');
    expect(text).toContain(`Last played: ${localDate(played.joined_at)}`);
    expect(text).toContain('Last played: -');
    expect(html).toContain('src="https://cdn.example.com/rspl.png"');
    expect(text).toContain(' M ');
  });

  it('lists tournaments only joined, without linking archived ones', () => {
    onSite('rspl');
    const archived = { ...registered, slug: 'old', name: 'Old Cup', status: 'archived' as const };
    const { html, text } = render({ registered_only: [registered, archived] });

    expect(text).toContain('No tournaments played yet.');
    expect(text).toContain('Also joined');
    expect(html).toContain(`href="${tournamentUrl('dcpl')}"`);
    expect(text).toContain('Old Cup');
    expect(html).not.toContain(`href="${tournamentUrl('old')}"`);
  });
});
