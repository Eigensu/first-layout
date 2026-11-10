import type { Contest } from '../../types/arena';

/**
 * Whether a team in this contest can still be changed (captain, vice-captain,
 * players). Same rule as the website, where Edit Team only works while the
 * contest is "live", meaning it hasn't started yet. Once it's ongoing the
 * API rejects edits with 409.
 *
 * This deliberately trusts the server's status rather than comparing
 * start_at with the device clock, which can be wrong. The API recomputes
 * status from its own clock on every contest fetch, so screens refetch the
 * contest before showing edit controls, and a 409 refetches it too.
 */
export const canEditTeamInContest = (
    contest: Pick<Contest, 'status'> | null | undefined,
): boolean => contest?.status === 'live';

/** Why editing is off. Wording matches the website. */
export const teamEditingLockedReason = (
    contest: Pick<Contest, 'status'> | null | undefined,
): string =>
    contest?.status === 'ongoing'
        ? 'Team editing is disabled during ongoing contests'
        : 'Team editing is only available during live contests';
