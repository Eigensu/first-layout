import apiClient from "../client";

/**
 * The tournament's CricHeroes stats, as cached by the backend's hourly sync
 * (apps/backend/app/routes/cricheroes.py; docs/CRICHEROES_INTEGRATION_TECH_SPEC.md
 * §9.2). Unauthenticated, and scoped to the subdomain's tournament by the
 * X-Tournament-Slug header the API client adds. These never reach CricHeroes:
 * a page can call them as often as it likes without spending quota.
 *
 * Field names are the backend's (`team_name`, `fours`), not CricHeroes'.
 * Numbers that CricHeroes send as text ("81.00", "92.2") stay text.
 */
export interface CachedTable<Row> {
  /** False: no CricHeroes tournament is linked to this one, so no stats. */
  linked: boolean;
  /** When CricHeroes was last read for this table (ISO, IST). Null: linked,
   *  but not fetched yet. Rows survive a failed refresh, so this is their age. */
  fetched_at: string | null;
  rows: Row[];
}

export interface PointTableRow {
  team_name: string;
  team_id?: number | null;
  team_logo?: string | null;
  group?: string | null;
  group_id?: number | null;
  round_id?: number | null;
  round_name?: string | null;
  matches?: number | null;
  won?: number | null;
  lost?: number | null;
  drawn?: number | null;
  tied?: number | null;
  no_result?: number | null;
  points?: number | null;
  /** "-0.200", or "0" before a result counts. */
  net_rr?: string | null;
  /** Despite the name, every result so far: "W-W-L". */
  last_5?: string | null;
  quotient?: number | null;
}

/** CricHeroes' MVP points (their formula, not our fantasy points), as
 *  three-decimal strings: "94.183". */
export interface MvpRow {
  player_id: number;
  name: string;
  team_id?: number | null;
  team_name?: string | null;
  profile_photo?: string | null;
  matches?: number | null;
  batting?: string | null;
  bowling?: string | null;
  fielding?: string | null;
  total?: string | null;
  rank?: number | null;
}

export interface BattingRow {
  player_id: number;
  name: string;
  team_id?: number | null;
  team_name?: string | null;
  profile_photo?: string | null;
  total_match?: number | null;
  innings?: number | null;
  total_runs?: number | null;
  highest_run?: number | null;
  /** "*" when the highest score was not out, otherwise "". */
  highest_run_with_not_out?: string | null;
  not_out?: number | null;
  ball_faced?: number | null;
  average?: string | null;
  strike_rate?: string | null;
  fours?: number | null;
  sixes?: number | null;
  fifties?: number | null;
  hundreds?: number | null;
}

export interface BowlingRow {
  player_id: number;
  name: string;
  team_id?: number | null;
  team_name?: string | null;
  profile_photo?: string | null;
  total_match?: number | null;
  innings?: number | null;
  total_wickets?: number | null;
  highest_wicket?: number | null;
  maidens?: number | null;
  runs?: number | null;
  balls?: string | null;
  /** Cricket notation: "92.2" is 92 overs and 2 balls. */
  overs?: string | null;
  economy?: string | null;
  strike_rate?: string | null;
  average?: number | null;
  three_wickets?: number | null;
  four_wickets?: number | null;
  five_wickets?: number | null;
}

async function cached<Row>(path: string): Promise<CachedTable<Row>> {
  const response = await apiClient.get<CachedTable<Row>>(`/api/cricheroes/${path}`);
  return response.data;
}

export const publicCricHeroesApi = {
  pointTable: () => cached<PointTableRow>("point-table"),
  mvp: () => cached<MvpRow>("mvp"),
  battingLeaderboard: () => cached<BattingRow>("batting-leaderboard"),
  bowlingLeaderboard: () => cached<BowlingRow>("bowling-leaderboard"),
};
