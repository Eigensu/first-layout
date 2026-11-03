import apiClient from "./client";
import type { TournamentStatus } from "@/common/consts";

/** A registry row as anyone may see it (GET /api/tournaments). */
export interface PublicTournament {
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  status: TournamentStatus;
  start_at: string | null;
  end_at: string | null;
}

/**
 * Every tournament that is not archived, newest first: the root domain's
 * directory. Needs no tournament header, so it works on the apex.
 */
export async function getPublicTournaments(): Promise<PublicTournament[]> {
  const response = await apiClient.get<PublicTournament[]>("/api/tournaments");
  return response.data;
}

/** A tournament this account made a team or entered a contest in. */
export interface PlayedTournament {
  slug: string;
  name: string;
  logo_url: string | null;
  status: TournamentStatus;
  // The name they played under there, which need not be their username now.
  display_name: string;
  joined_at: string;
  first_played_at: string | null;
  last_active_at: string | null;
  teams_count: number;
  contests_count: number;
  best_rank: number | null;
  total_points: number;
}

/** A tournament this account joined without ever playing. */
export interface RegisteredTournament {
  slug: string;
  name: string;
  logo_url: string | null;
  status: TournamentStatus;
  joined_at: string;
}

export interface MyTournaments {
  played: PlayedTournament[];
  registered_only: RegisteredTournament[];
}

/**
 * Every tournament this account has joined, most recently active first
 * (GET /api/users/me/tournaments). The numbers come from a job, so they can
 * trail a live tournament by a refresh.
 */
export async function getMyTournaments(): Promise<MyTournaments> {
  const response = await apiClient.get<MyTournaments>("/api/users/me/tournaments");
  return response.data;
}
