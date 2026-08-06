import type { ContestFormat } from "@/common/consts/contest";

export interface Player {
  id: string;
  name: string;
  team: string;
  points: number;
  price: number;
  slotLabel?: string;
  image?: string;
  stats?: {
    matches: number;
    runs?: number;
    wickets?: number;
    average?: number;
  };
  /** Optional: mark player as hot (selected in many teams) */
  isHot?: boolean;
}

export interface PlayerCardProps {
  player: Player;
  isSelected: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  onSelect: (playerId: string) => void;
  onSetCaptain?: (playerId: string) => void;
  onSetViceCaptain?: (playerId: string) => void;
  onReplace?: (playerId: string) => void;
  showActions?: boolean;
  compact?: boolean;
  className?: string;
  compactShowPrice?: boolean;
  disabled?: boolean;
  /** Visual/layout variant. Use 'captain' in Step 2 to hide price/matches and show larger avatar. */
  variant?: "default" | "captain";
  /** Contest format, used to label and format a player's value */
  contestFormat?: ContestFormat;
  /** Shown as a tooltip when the card is disabled, explaining why */
  disabledReason?: string;
}

export interface PlayerListProps {
  players: Player[];
  selectedPlayers: string[];
  captainId?: string;
  viceCaptainId?: string;
  onPlayerSelect: (playerId: string) => void;
  onSetCaptain?: (playerId: string) => void;
  onSetViceCaptain?: (playerId: string) => void;
  /** Overall maximum selection */
  maxSelections?: number;
  /** Optional active slot filter */
  filterSlot?: number;
  /** Called if a selection is blocked due to limits */
  onBlockedSelect?: (reason: string) => void;
  showActions?: boolean;
  compact?: boolean;
  className?: string;
  /** When compact, show price instead of points on the right */
  compactShowPrice?: boolean;
  /** Function to determine if a player should be disabled */
  isPlayerDisabled?: (player: Player) => boolean;
  /** Explains why a disabled player cannot be picked; shown as a tooltip */
  getDisabledReason?: (player: Player) => string | null;
  /** Show the real-world team dropdown and value/points sort controls */
  showPoolFilters?: boolean;
  /** Contest format, used to label and format a player's value */
  contestFormat?: ContestFormat;
}

/** Ordering options for the open pool in auction contests. */
export const POOL_SORTS = {
  VALUE_DESC: "value_desc",
  VALUE_ASC: "value_asc",
  POINTS_DESC: "points_desc",
  NAME_ASC: "name_asc",
} as const;

export type PoolSort = (typeof POOL_SORTS)[keyof typeof POOL_SORTS];
