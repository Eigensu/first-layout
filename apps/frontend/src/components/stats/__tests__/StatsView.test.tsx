import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  BattingRow,
  BowlingRow,
  CachedTable,
  MvpRow,
  PointTableRow,
} from '@/lib/api/public/cricheroes';
import { parseCricHeroesTournamentId } from '@/utils/cricheroes';
import { StatsView } from '../StatsView';
import { BattingTable, BowlingTable, MvpTable, PointsTable } from '../StatsTables';
import type { Loadable, TournamentStats } from '../useTournamentStats';

function text(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, ' ');
}

const FETCHED = '2026-11-05T15:30:00+05:30';

const australia: PointTableRow = {
  team_name: 'Australia (WC19)',
  team_id: 362535,
  group: 'A',
  matches: 8,
  won: 7,
  lost: 1,
  drawn: 0,
  tied: 0,
  no_result: 0,
  points: 14,
  net_rr: '1.065',
  last_5: 'W-W-W-W-W-W-W-L',
};

function ready<Row>(table: Partial<CachedTable<Row>>): Loadable<Row> {
  return { state: 'ready', table: { linked: true, fetched_at: null, rows: [], ...table } };
}

function everyTable(points: Loadable<PointTableRow>): TournamentStats {
  return {
    pointTable: points,
    mvp: ready<MvpRow>({}),
    batting: ready<BattingRow>({}),
    bowling: ready<BowlingRow>({}),
  };
}

function view(stats: TournamentStats, hasTournament = true) {
  return text(
    renderToStaticMarkup(
      <StatsView stats={stats} onRetry={vi.fn()} hasTournament={hasTournament} />,
    ),
  );
}

describe('StatsView', () => {
  it('shows the points table with when it was last read', () => {
    const shown = view(everyTable(ready({ fetched_at: FETCHED, rows: [australia] })));

    expect(shown).toContain('Last updated 5 Nov, 3:30 pm IST');
    expect(shown).toContain('Australia (WC19)');
    expect(shown).toContain('1.065');
    for (const tab of ['Points Table', 'MVP', 'Batting', 'Bowling']) {
      expect(shown).toContain(tab);
    }
  });

  it('says so when the tournament is not linked to CricHeroes', () => {
    const unlinked = ready<PointTableRow>({ linked: false });
    const shown = view({
      pointTable: unlinked,
      mvp: ready<MvpRow>({ linked: false }),
      batting: ready<BattingRow>({ linked: false }),
      bowling: ready<BowlingRow>({ linked: false }),
    });

    expect(shown).toContain('No stats for this tournament');
    expect(shown).not.toContain('Points Table');
  });

  it('says stats are coming when linked but not read yet', () => {
    const shown = view(everyTable(ready({})));

    expect(shown).toContain('No stats yet');
    expect(shown).not.toContain('Last updated');
  });

  it('says a table read from CricHeroes is empty, and when it was read', () => {
    const shown = view(everyTable(ready({ fetched_at: FETCHED })));

    expect(shown).toContain('The points table is empty');
    expect(shown).toContain('Last updated');
  });

  it('offers a retry when a table failed to load', () => {
    const shown = view(everyTable({ state: 'error', message: 'Network Error' }));

    expect(shown).toContain("Couldn't load the points table");
    expect(shown).toContain('Network Error');
    expect(shown).toContain('Try again');
  });

  it('shows placeholders while loading', () => {
    const html = renderToStaticMarkup(
      <StatsView stats={everyTable({ state: 'loading' })} onRetry={vi.fn()} hasTournament />,
    );
    expect(html).toContain('aria-busy="true"');
  });

  it('asks for a tournament off a tournament’s own site', () => {
    expect(view(everyTable({ state: 'loading' }), false)).toContain('Pick a tournament');
  });
});

describe('the tables', () => {
  it('splits the points table by group when there is more than one', () => {
    const shown = text(
      renderToStaticMarkup(
        <PointsTable
          rows={[
            { ...australia, round_name: 'League Matches', group_id: 1 },
            { ...australia, team_name: 'India (WC19)', group: 'B', round_name: 'League Matches', group_id: 2 },
          ]}
        />,
      ),
    );
    expect(shown).toContain('League Matches · Group A');
    expect(shown).toContain('League Matches · Group B');
  });

  it('shows form as the last five results', () => {
    const html = renderToStaticMarkup(<PointsTable rows={[australia]} />);
    expect(html).toContain('Results so far: W, W, W, W, W, W, W, L');
    expect(html.match(/bg-success-tonal/g)).toHaveLength(4);
    expect(html.match(/bg-danger-tonal/g)).toHaveLength(1);
  });

  it('marks a not-out highest score, and dashes what CricHeroes left out', () => {
    const shown = text(
      renderToStaticMarkup(
        <BattingTable
          rows={[
            {
              player_id: 1,
              name: 'Rohit Sharma',
              team_name: 'India (WC19)',
              total_runs: 648,
              highest_run: 140,
              highest_run_with_not_out: '*',
              average: null,
            },
          ]}
        />,
      ),
    );
    expect(shown).toContain('Rohit Sharma');
    expect(shown).toContain('India (WC19)');
    expect(shown).toContain('140*');
    expect(shown).toContain('–');
  });

  it('ranks MVPs by CricHeroes’ rank', () => {
    const shown = text(
      renderToStaticMarkup(
        <MvpTable rows={[{ player_id: 1, name: 'Shakib Al Hasan', total: '94.183', rank: 3 }]} />,
      ),
    );
    expect(shown).toMatch(/3 SA Shakib Al Hasan/);
    expect(shown).toContain('94.183');
  });

  it('shows bowling figures as sent', () => {
    const shown = text(
      renderToStaticMarkup(
        <BowlingTable
          rows={[{ player_id: 2, name: 'Mitchell Starc', total_wickets: 27, overs: '92.2', economy: '5.45' }]}
        />,
      ),
    );
    expect(shown).toContain('27');
    expect(shown).toContain('92.2');
    expect(shown).toContain('5.45');
  });
});

describe('parseCricHeroesTournamentId', () => {
  it.each([
    ['2242502', 2242502],
    [' 2242502 ', 2242502],
    ['https://cricheroes.com/tournament/2242502/tyrant-premier-league/stats', 2242502],
    ['0', null],
    ['-5', null],
    ['12.5', null],
    ['abc', null],
    ['', null],
    ['9007199254740992', null],
  ])('%j → %j', (input, expected) => {
    expect(parseCricHeroesTournamentId(input)).toBe(expected);
  });
});
