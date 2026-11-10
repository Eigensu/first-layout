// Contest Types
export type ContestStatus = 'live' | 'ongoing' | 'completed' | 'archived';
export type ContestVisibility = 'public' | 'private';
export type ContestType = 'daily' | 'full';

export interface Contest {
    id: string;
    code: string;
    name: string;
    description: string | null;
    logo_url?: string;
    start_at: string; // ISO datetime
    end_at: string; // ISO datetime
    status: ContestStatus;
    visibility: ContestVisibility;
    points_scope: 'time_window' | 'snapshot';
    contest_type: ContestType;
    allowed_teams: string[]; // e.g., ["IND", "AUS"]
    created_at: string;
    updated_at: string;
}

export interface ContestListResponse {
    contests: Contest[];
    total: number;
    page: number;
    page_size: number;
}

// Player Types
export interface Player {
    id: string;
    name: string;
    team: string | null; // Real-world team (e.g., "IND", "AUS")
    price: number;
    slot: string | null; // Slot ID (role)
    points: number;
    is_available: boolean;
    is_hot_pick?: boolean; // Hot pick indicator (selected by more than 10 teams)
    selected_by_teams?: number; // Number of teams that have selected this player
    stats: Record<string, any> | null;
    form: string | null;
    injury_status: string | null;
    image_url: string | null;
    created_at: string | null;
    updated_at: string | null;
}

// Hot Player Types
export interface PlayerHot {
    player: Player;
    selection_count: number;
    is_hot: boolean;
}

export interface PlayerHotIds {
    player_ids: string[];
    threshold: number;
}

export interface PlayerHotSingle {
    player_id: string;
    selection_count_global: number;
    is_hot_global: boolean;
    selection_count_contest?: number;
    is_hot_contest?: boolean;
}

// Slot Types (Roles)
export interface Slot {
    id: string;
    code: string; // e.g., "WK", "BAT", "AR", "BOWL"
    name: string; // e.g., "Wicket Keeper", "Batsman"
    min_select: number;
    max_select: number;
    description: string | null;
    requirements: Record<string, any> | null;
    player_count: number;
    created_at: string;
    updated_at: string;
}

export interface SlotListResponse {
    slots: Slot[];
    total: number;
}

// Team Types
export interface Team {
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

export interface TeamCreate {
    team_name: string;
    player_ids: string[]; // 1-16 players
    captain_id: string;
    vice_captain_id: string;
    contest_id?: string | null;
}

export interface TeamUpdate {
    team_name?: string;
    player_ids?: string[];
    captain_id?: string;
    vice_captain_id?: string;
}

export interface TeamsListResponse {
    teams: Team[];
    total: number;
}

// Enrollment Types
export interface Enrollment {
    id: string;
    team_id: string;
    user_id: string;
    contest_id: string;
    status: 'active' | 'removed';
    enrolled_at: string;
    removed_at: string | null;
}

// Leaderboard Types
export interface LeaderboardEntry {
    rank: number;
    username: string;
    displayName: string;
    teamName: string;
    points: number;
    rankChange: number | null;
    avatarUrl: string | null;
    teamId: string | null;
}

export interface LeaderboardResponse {
    entries: LeaderboardEntry[];
    currentUserEntry: LeaderboardEntry | null;
}

// Contest Team Details
export interface ContestTeamPlayer {
    id: string;
    name: string;
    team: string | null;
    price: number;
    base_points: number;
    contest_points: number;
    slot: string | null;
}

export interface ContestTeamResponse {
    team_id: string;
    team_name: string;
    contest_id: string;
    base_points: number;
    contest_points: number;
    players: ContestTeamPlayer[];
}
