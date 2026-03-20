import { NEXT_PUBLIC_API_URL } from "@/config/env";
import { extractErrorMessage } from "@/utils/errors";

export interface TeamData {
  team_name: string;
  player_ids: string[];
  captain_id: string;
  vice_captain_id: string;
  contest_id?: string;
}

export interface TeamResponse {
  id: string;
  user_id: string;
  team_name: string;
  player_ids: string[];
  captain_id: string | null;
  vice_captain_id: string | null;
  total_points: number;
  total_value: number;
  rank: number | null;
  rank_change: number | null;
  contest_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamsListResponse {
  teams: TeamResponse[];
  total: number;
}

/**
 * Create a new team
 */
export async function createTeam(teamData: TeamData, token: string): Promise<TeamResponse> {
  const response = await fetch(`${NEXT_PUBLIC_API_URL}/api/teams/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(teamData),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error?.detail, "Failed to create team"));
  }

  return response.json();
}

/**
 * Get all teams for the current user
 */
export async function getUserTeams(token: string, skip = 0, limit = 100): Promise<TeamsListResponse> {
  const response = await fetch(
    `${NEXT_PUBLIC_API_URL}/api/teams/?skip=${skip}&limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error?.detail, "Failed to fetch teams"));
  }

  return response.json();
}

/**
 * Get a specific team by ID
 */
export async function getTeam(teamId: string, token: string): Promise<TeamResponse> {
  const response = await fetch(`${NEXT_PUBLIC_API_URL}/api/teams/${teamId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error?.detail, "Failed to fetch team"));
  }

  return response.json();
}

/**
 * Update a team
 */
export async function updateTeam(
  teamId: string,
  teamData: Partial<TeamData>,
  token: string
): Promise<TeamResponse> {
  const response = await fetch(`${NEXT_PUBLIC_API_URL}/api/teams/${teamId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(teamData),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error?.detail, "Failed to update team"));
  }

  return response.json();
}

/**
 * Rename a team
 */
export async function renameTeam(
  teamId: string,
  teamName: string,
  token: string
): Promise<TeamResponse> {
  const response = await fetch(
    `${NEXT_PUBLIC_API_URL}/api/teams/${teamId}/rename?team_name=${encodeURIComponent(teamName)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error?.detail, "Failed to rename team"));
  }

  return response.json();
}

/**
 * Delete a team
 */
export async function deleteTeam(teamId: string, token: string): Promise<void> {
  const response = await fetch(`${NEXT_PUBLIC_API_URL}/api/teams/${teamId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error?.detail, "Failed to delete team"));
  }
}
