import apiClient from "../client";

export type ContestStatus = "live" | "ongoing" | "completed" | "archived";
export type ContestVisibility = "public" | "private";
export type PointsScope = "time_window" | "snapshot";
export type ContestType = "daily" | "full";

export interface Contest {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  start_at: string;
  end_at: string;
  status: ContestStatus;
  visibility: ContestVisibility;
  points_scope: PointsScope;
  contest_type: ContestType;
  allowed_teams: string[];
  created_at: string;
  updated_at: string;
}

export interface ContestListResponse {
  contests: Contest[];
  total: number;
  page: number;
  page_size: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  displayName: string;
  teamName: string;
  points: number;
  rankChange?: number | null;
  avatarUrl?: string | null;
  teamId?: string | null;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  currentUserEntry?: LeaderboardEntry | null;
}

export interface EnrollmentResponse {
  id: string;
  team_id: string;
  user_id: string;
  contest_id: string;
  status: "active" | "removed";
  enrolled_at: string;
  removed_at?: string | null;
}

export interface ContestTeamPlayer {
  id: string;
  name: string;
  team?: string | null;
  price: number;
  base_points: number;
  contest_points: number;
  slot?: string | null;
}

export interface ContestTeamResponse {
  team_id: string;
  team_name: string;
  contest_id: string;
  base_points: number;
  contest_points: number;
  captain_id?: string | null;
  vice_captain_id?: string | null;
  players: ContestTeamPlayer[];
}

export const publicContestsApi = {
  list: async (params?: {
    page?: number;
    page_size?: number;
    status?: ContestStatus;
    q?: string;
  }): Promise<ContestListResponse> => {
    const response = await apiClient.get("/api/contests", { params });
    return response.data;
  },
  get: async (id: string): Promise<Contest> => {
    const response = await apiClient.get(`/api/contests/${id}`);
    return response.data;
  },
  getMe: async (id: string): Promise<Contest> => {
    const response = await apiClient.get(`/api/contests/${id}/me`);
    return response.data;
  },
  leaderboard: async (
    id: string,
    params?: { skip?: number; limit?: number }
  ): Promise<LeaderboardResponse> => {
    const response = await apiClient.get(`/api/contests/${id}/leaderboard`, {
      params,
    });
    return response.data;
  },
  enroll: async (
    contestId: string,
    teamId: string
  ): Promise<EnrollmentResponse> => {
    const response = await apiClient.post(`/api/contests/${contestId}/enroll`, {
      team_id: teamId,
    });
    return response.data;
  },
  myEnrollments: async (): Promise<EnrollmentResponse[]> => {
    const response = await apiClient.get(`/api/contests/enrollments/me`);
    return response.data;
  },
  teamInContest: async (
    contestId: string,
    teamId: string
  ): Promise<ContestTeamResponse> => {
    const response = await apiClient.get(
      `/api/contests/${contestId}/teams/${teamId}`
    );
    return response.data;
  },
};
