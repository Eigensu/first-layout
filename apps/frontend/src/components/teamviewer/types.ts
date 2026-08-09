// Team Viewer Types
// Shared types for pitch view and list view components

import type {
  TeamBasic,
  ContestTeamData,
  TeamEnrollmentMeta,
} from "./organisms/TeamCard";

// Re-export for convenience
export type { TeamBasic, ContestTeamData, TeamEnrollmentMeta };

// Extended PlayerBasic that includes slot
export interface PlayerBasic {
  id: string;
  name: string;
  team?: string;
  role?: string;
  slot?: number | string; // Can be a number (1-4) or a MongoDB ObjectID string
  image?: string;
  points?: number;
  /** Auction sale value. Only meaningful in auction_purse contests. */
  price?: number;
}

// View mode for team display
export type TeamViewMode = "pitch" | "list";

// Player slot (1-4 based system)
export type PlayerSlot = 1 | 2 | 3 | 4;

// Slot-based formation for team players
export interface SlotFormation {
  slot1: string[]; // Slot 1 players - Top row
  slot2: string[]; // Slot 2 players - Upper-middle row
  slot3: string[]; // Slot 3 players - Lower-middle row
  slot4: string[]; // Slot 4 players - Bottom row
}

// Stats displayed in header
export interface TeamStats {
  averagePoints?: number;
  highestPoints?: number;
  totalPoints: number;
  rank?: number;
  transfers?: number;
}

// Player data for pitch view
export interface PitchPlayer {
  id: string;
  name: string;
  team?: string;
  slot: number; // 1, 2, 3, or 4
  image?: string;
  points: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isSubstitute?: boolean;
}

// Slot color gradients
export const slotColors: Record<number, string> = {
  1: "from-amber-400 to-yellow-600", // Gold/Yellow
  2: "from-blue-500 to-indigo-600", // Blue
  3: "from-emerald-400 to-teal-600", // Green/Teal
  4: "from-purple-500 to-pink-600", // Purple/Pink
};

// Helper function to get slot gradient
export function getSlotGradient(slot: number): string {
  return `bg-gradient-to-br ${slotColors[slot] || slotColors[1]}`;
}

// Helper function to get slot label
export function getSlotLabel(slot: number): string {
  return `Slot ${slot}`;
}

// Helper function to get slot abbreviation
export function getSlotAbbr(slot: number): string {
  return `S${slot}`;
}

// Calculate formation from players
export function calculateFormation(players: PitchPlayer[]): SlotFormation {
  const slot1 = players.filter((p) => p.slot === 1 && !p.isSubstitute);
  const slot2 = players.filter((p) => p.slot === 2 && !p.isSubstitute);
  const slot3 = players.filter((p) => p.slot === 3 && !p.isSubstitute);
  const slot4 = players.filter((p) => p.slot === 4 && !p.isSubstitute);

  return {
    slot1: slot1.map((p) => p.id),
    slot2: slot2.map((p) => p.id),
    slot3: slot3.map((p) => p.id),
    slot4: slot4.map((p) => p.id),
  };
}

// Transform basic players to pitch players
export function transformToPitchPlayers(
  players: PlayerBasic[],
  captainId: string | null | undefined,
  viceCaptainId: string | null | undefined,
  contestData?: ContestTeamData
): PitchPlayer[] {
  const contestMap = new Map<string, number>(
    (contestData?.players || []).map((p) => [p.id, p.contest_points])
  );

  // Collect unique slot IDs and map them to row numbers (1-4)
  const slotIdToNumber = new Map<string, number>();
  let slotIndex = 0;
  players.forEach((p) => {
    const slotVal = p.slot;
    if (slotVal && typeof slotVal === 'string' && !slotIdToNumber.has(slotVal)) {
      slotIdToNumber.set(slotVal, (slotIndex % 4) + 1);
      slotIndex++;
    }
  });

  return players.map((player) => {
    // Convert slot ID to row number
    let slotNumber = 1;
    if (player.slot) {
      if (typeof player.slot === 'number') {
        slotNumber = player.slot;
      } else if (typeof player.slot === 'string') {
        slotNumber = slotIdToNumber.get(player.slot) || 1;
      }
    }

    return {
      id: player.id,
      name: player.name,
      team: player.team,
      slot: slotNumber,
      image: player.image,
      points: contestMap.has(player.id)
        ? contestMap.get(player.id) || 0
        : player.points || 0,
      isCaptain: player.id === captainId,
      isViceCaptain: player.id === viceCaptainId,
      isSubstitute: false,
    };
  });
}

// Calculate team stats
export function calculateTeamStats(
  team: TeamBasic,
  contestData?: ContestTeamData
): TeamStats {
  return {
    totalPoints: contestData?.contest_points ?? team.total_points ?? 0,
    rank: team.rank ?? undefined,
    // These could be calculated from historical data if available
    averagePoints: undefined,
    highestPoints: undefined,
    transfers: undefined,
  };
}

// Get initials from name
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Format large numbers with commas
export function formatNumber(num: number): string {
  return num.toLocaleString();
}
