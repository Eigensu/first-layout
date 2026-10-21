import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Tournament, TournamentAdmin } from '@/lib/api/admin/tournaments';
import { TournamentAdminsDialog, TournamentAdminsList } from '../TournamentAdminsDialog';

const asha: TournamentAdmin = {
  user_id: 'u1',
  username: 'asha',
  full_name: 'Asha Rao',
  email: 'asha@example.com',
  display_name: 'asha',
};

function text(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function list(admins: TournamentAdmin[], removingId: string | null = null) {
  return renderToStaticMarkup(
    <TournamentAdminsList admins={admins} removingId={removingId} onRemove={vi.fn()} />,
  );
}

describe('TournamentAdminsList', () => {
  it('says platform admins can still run a tournament with no admins', () => {
    expect(text(list([]))).toContain('No admins yet. Platform admins can still run it.');
  });

  it('shows each admin by name, with their username and email', () => {
    const shown = text(list([asha]));

    expect(shown).toContain('Asha Rao');
    expect(shown).toContain('asha · asha@example.com');
    expect(shown).toContain('Remove');
  });

  it('shows the name they go by here when it differs from their username', () => {
    const shown = text(
      list([{ ...asha, full_name: null, email: null, display_name: 'asha_plays' }]),
    );

    expect(shown).toContain('asha_plays');
    expect(shown).toContain('asha_plays here · asha');
  });

  it('disables the row being removed', () => {
    const html = list([asha, { ...asha, user_id: 'u2', full_name: 'Zara' }], 'u1');

    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });
});

describe('TournamentAdminsDialog', () => {
  it('opens on the tournament, loading its admins', () => {
    const tournament = { id: 't1', name: 'Alpha League' } as Tournament;
    const shown = text(
      renderToStaticMarkup(<TournamentAdminsDialog tournament={tournament} onClose={vi.fn()} />),
    );

    expect(shown).toContain('Admins of Alpha League');
    expect(shown).toContain('nothing in any other tournament');
    expect(shown).toContain('Make admin');
    expect(shown).toContain('Loading…');
  });
});
