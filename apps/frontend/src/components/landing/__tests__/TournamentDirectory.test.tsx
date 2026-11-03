import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PublicTournament } from '@/lib/api/tournaments';
import { sortTournaments, TournamentCard } from '../TournamentDirectory';

function tournament(overrides: Partial<PublicTournament>): PublicTournament {
  return {
    slug: 'rspl',
    name: 'Rspl',
    description: null,
    logo_url: null,
    status: 'live',
    start_at: null,
    end_at: null,
    ...overrides,
  };
}

function render(t: PublicTournament) {
  const html = renderToStaticMarkup(<TournamentCard tournament={t} />);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return { html, text };
}

describe('sortTournaments', () => {
  it('puts live first, then upcoming, then completed newest first', () => {
    const rows = [
      tournament({ slug: 'old', status: 'completed', start_at: '2026-01-01T00:00:00' }),
      tournament({ slug: 'soon', status: 'draft' }),
      tournament({ slug: 'recent', status: 'completed', start_at: '2026-06-01T00:00:00' }),
      tournament({ slug: 'dcpl', status: 'live' }),
    ];
    expect(sortTournaments(rows).map((t) => t.slug)).toEqual([
      'dcpl',
      'soon',
      'recent',
      'old',
    ]);
  });

  it('leaves the input in its order', () => {
    const rows = [
      tournament({ slug: 'a', status: 'completed' }),
      tournament({ slug: 'b', status: 'live' }),
    ];
    sortTournaments(rows);
    expect(rows.map((t) => t.slug)).toEqual(['a', 'b']);
  });
});

describe('TournamentCard', () => {
  it('links to the tournament subdomain', () => {
    const { html, text } = render(tournament({ slug: 'dcpl', name: 'DCPL' }));
    expect(html).toContain('href="https://dcpl.wallearena.com"');
    expect(text).toContain('DCPL');
    expect(text).toContain('LIVE NOW');
  });

  it('shows a draft as upcoming', () => {
    expect(render(tournament({ status: 'draft' })).text).toContain('UPCOMING');
  });

  it('leaves out the date and logo a registry row does not have', () => {
    const { html, text } = render(tournament({}));
    expect(html).not.toContain('<img');
    expect(text).not.toMatch(/\d{1,2} [A-Z][a-z]{2}/);
  });

  it('shows the logo and start when the row has them', () => {
    const { html, text } = render(
      tournament({
        logo_url: 'https://cdn.example.com/rspl.png',
        start_at: '2026-10-25T10:00:00+05:30',
      }),
    );
    expect(html).toContain('src="https://cdn.example.com/rspl.png"');
    // Shown in India time whatever the viewer's zone, as the contests are.
    expect(text).toContain('25 Oct');
  });
});
