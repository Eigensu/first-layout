import * as React from "react";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";

interface Player {
  id: string;
  name: string;
  role: string;
  team: string;
  points: number;
  price: number;
  image?: string;
  stats?: {
    matches: number;
    runs?: number;
    wickets?: number;
    average?: number;
  };
}

interface PlayerCardProps {
  player: Player;
  isSelected: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  onSelect: (playerId: string) => void;
  onSetCaptain?: (playerId: string) => void;
  onSetViceCaptain?: (playerId: string) => void;
  showActions?: boolean;
  compact?: boolean;
  className?: string;
  displayRoleMap?: (role: string) => string;
  compactShowPrice?: boolean;
}

const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  isSelected,
  isCaptain = false,
  isViceCaptain = false,
  onSelect,
  onSetCaptain,
  onSetViceCaptain,
  showActions = false,
  compact = false,
  className = "",
  displayRoleMap,
  compactShowPrice = false,
}) => {
  const getRoleBadgeVariant = (role: string) => {
    switch (role.toLowerCase()) {
      case "batsman":
      case "batsmen":
        return "success";
      case "bowler":
        return "error";
      case "all-rounder":
      case "allrounder":
        return "primary";
      case "wicket-keeper":
      case "wicketkeeper":
        return "warning";
      default:
        return "neutral";
    }
  };

  const getRoleAvatarGradient = (role: string) => {
    const r = role.toLowerCase();
    // Batsman: switch to amber-yellow to avoid matching primary button gradient
    if (r === "batsman" || r === "batsmen") return "bg-gradient-to-br from-amber-400 to-yellow-600";
    if (r === "bowler") return "bg-gradient-to-br from-blue-500 to-indigo-600";
    if (r === "all-rounder" || r === "allrounder") return "bg-gradient-to-br from-emerald-400 to-teal-600";
    if (r === "wicket-keeper" || r === "wicketkeeper") return "bg-gradient-to-br from-purple-500 to-pink-600";
    return undefined;
  };

  if (compact) {
    return (
      <div
        className={`
          flex items-center space-x-3 p-3 rounded-xl border-2 cursor-pointer transition-all
          ${isSelected ? "border-primary-300 bg-white" : "border-gray-200 hover:border-gray-300 bg-white"}
          ${className}
        `}
        onClick={() => onSelect(player.id)}
      >
        <Avatar
          name={player.name}
          src={player.image}
          size="sm"
          gradientClassName={getRoleAvatarGradient(player.role)}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900 truncate">{player.name}</h4>
          </div>
          <div className="flex items-center space-x-2 mt-1">
            <Badge variant={getRoleBadgeVariant(player.role)} size="sm">
              {displayRoleMap ? displayRoleMap(player.role) : player.role}
            </Badge>
            <span className="text-xs text-gray-500">{player.team}</span>
          </div>
        </div>

        {/* Right: Points then select radio aligned on the same line */}
        <div className="flex items-center space-x-2">
          {compactShowPrice ? (
            <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
              ₹{player.price.toFixed(1)}M
            </span>
          ) : (
            <span className="text-sm font-medium text-success-600 whitespace-nowrap">
              {player.points} pts
            </span>
          )}
          <div
            className={`
              w-5 h-5 rounded-full border-2 flex items-center justify-center
              ${isSelected ? "bg-primary-500 border-primary-500" : "border-gray-300"}
            `}
          >
            {isSelected && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card
      className={`
        relative cursor-pointer border-2 transition-all duration-300 hover:shadow-medium
        ${isSelected ? "border-primary-300 bg-white" : "border-gray-200 hover:border-gray-300"}
        ${className}
      `}
      onClick={() => onSelect(player.id)}
    >
      {/* Captain/Vice-Captain Badges */}
      {isCaptain && (
        <div className="absolute -top-2 -right-2 z-10">
          <Badge variant="warning" size="sm" className="shadow-md">
            Captain (2x)
          </Badge>
        </div>
      )}
      {isViceCaptain && (
        <div className="absolute -top-2 -right-2 z-10">
          <Badge variant="secondary" size="sm" className="shadow-md">
            Vice Captain (1.5x)
          </Badge>
        </div>
      )}

      <div className="p-4">
        {/* Player Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Avatar
              name={player.name}
              src={player.image}
              size="lg"
              gradientClassName={getRoleAvatarGradient(player.role)}
            />

            <div>
              <h4 className="font-semibold text-gray-900">{player.name}</h4>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant={getRoleBadgeVariant(player.role)} size="sm">
                  {displayRoleMap ? displayRoleMap(player.role) : player.role}
                </Badge>
                <span className="text-sm text-gray-500">{player.team}</span>
              </div>
            </div>
          </div>

          {/* Selection Indicator */}
          <div
            className={`
            w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
            ${isSelected ? "bg-primary-500 border-primary-500 scale-110" : "border-gray-300"}
          `}
          >
            {isSelected && (
              <svg
                className="w-4 h-4 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Player Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center">
            <div className="text-lg font-bold text-success-600">
              {player.points}
            </div>
            <div className="text-xs text-gray-500">Fantasy Points</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900">
              ₹{player.price.toFixed(1)}M
            </div>
            <div className="text-xs text-gray-500">Price</div>
          </div>
        </div>

        {/* Additional Stats */}
        {player.stats && (
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
            <div className="text-center">
              <div className="text-sm font-medium text-gray-900">
                {player.stats.matches}
              </div>
              <div className="text-xs text-gray-500">Matches</div>
            </div>
            {player.stats.runs && (
              <div className="text-center">
                <div className="text-sm font-medium text-gray-900">
                  {player.stats.runs}
                </div>
                <div className="text-xs text-gray-500">Runs</div>
              </div>
            )}
            {player.stats.wickets && (
              <div className="text-center">
                <div className="text-sm font-medium text-gray-900">
                  {player.stats.wickets}
                </div>
                <div className="text-xs text-gray-500">Wickets</div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {showActions && isSelected && (
          <div className="flex space-x-2 mt-4 pt-3 border-t border-gray-100">
            {onSetCaptain && !isCaptain && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetCaptain(player.id);
                }}
                className="flex-1 px-3 py-1.5 text-xs font-medium text-warning-700 bg-warning-50 border border-warning-200 rounded-lg hover:bg-warning-100"
              >
                Make Captain
              </button>
            )}
            {onSetViceCaptain && !isViceCaptain && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetViceCaptain(player.id);
                }}
                className="flex-1 px-3 py-1.5 text-xs font-medium text-secondary-700 bg-secondary-50 border border-secondary-200 rounded-lg hover:bg-secondary-100"
              >
                Make V.Captain
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

// Player List Component
interface PlayerListProps {
  players: Player[];
  selectedPlayers: string[];
  captainId?: string;
  viceCaptainId?: string;
  onPlayerSelect: (playerId: string) => void;
  onSetCaptain?: (playerId: string) => void;
  onSetViceCaptain?: (playerId: string) => void;
  /** Overall maximum selection across all roles */
  maxSelections?: number;
  /** Optional per-role selection limits, e.g. { "Batsman": 4 } */
  roleLimits?: Record<string, number>;
  /** Optional active role filter. Use "All" or undefined for no filter */
  filterRole?: string;
  /** Optional active slot filter. If provided, overrides filterRole */
  filterSlot?: number;
  /** Sort players by role category order */
  sortByRole?: boolean;
  /** Called if a selection is blocked due to limits */
  onBlockedSelect?: (reason: string) => void;
  showActions?: boolean;
  compact?: boolean;
  className?: string;
  /** Optional mapper to override the displayed role label for child cards */
  displayRoleMap?: (role: string) => string;
  /** When compact, show price instead of points on the right */
  compactShowPrice?: boolean;
}

const PlayerList: React.FC<PlayerListProps> = ({
  players,
  selectedPlayers,
  captainId,
  viceCaptainId,
  onPlayerSelect,
  onSetCaptain,
  onSetViceCaptain,
  maxSelections = 16,
  roleLimits,
  filterRole,
  filterSlot,
  sortByRole = true,
  onBlockedSelect,
  showActions = false,
  compact = false,
  className = "",
  displayRoleMap,
  compactShowPrice = false,
}) => {
  // Normalize role names to canonical categories
  const normalizeRole = (role: string): string => {
    const r = role.toLowerCase();
    if (r === "batsman" || r === "batsmen") return "Batsman";
    if (r === "bowler") return "Bowler";
    if (r === "all-rounder" || r === "allrounder") return "All-Rounder";
    if (r === "wicket-keeper" || r === "wicketkeeper") return "Wicket-Keeper";
    return role;
  };

  // Normalize helper already declared below for list operations

  const ROLE_ORDER = ["Batsman", "Bowler", "All-Rounder", "Wicket-Keeper"];

  // Build a map from playerId to normalized role for quick lookup
  const idToRole = React.useMemo(() => {
    const m = new Map<string, string>();
    players.forEach((p) => m.set(p.id, normalizeRole(p.role)));
    return m;
  }, [players]);

  // Count selected per role
  const selectedCountByRole = React.useMemo(() => {
    const counts: Record<string, number> = {};
    selectedPlayers.forEach((id) => {
      const role = idToRole.get(id);
      if (!role) return;
      counts[role] = (counts[role] || 0) + 1;
    });
    return counts;
  }, [selectedPlayers, idToRole]);

  const canSelectMoreTotal = selectedPlayers.length < maxSelections;

  const playersPrepared = React.useMemo(() => {
    let list = players.slice();
    if (typeof filterSlot === "number") {
      list = list.filter((p) => (p as any).slot === filterSlot);
    } else if (filterRole && filterRole !== "All") {
      list = list.filter((p) => normalizeRole(p.role) === filterRole);
    }
    if (sortByRole) {
      list.sort((a, b) => {
        const ar = ROLE_ORDER.indexOf(normalizeRole(a.role));
        const br = ROLE_ORDER.indexOf(normalizeRole(b.role));
        return ar - br;
      });
    }
    return list;
  }, [players, filterRole, filterSlot, sortByRole]);

  const handleSelect = (playerId: string) => {
    const isAlreadySelected = selectedPlayers.includes(playerId);
    if (isAlreadySelected) {
      onPlayerSelect(playerId); // toggle off
      return;
    }

    if (!canSelectMoreTotal) {
      onBlockedSelect?.(`You can select at most ${maxSelections} players in total.`);
      return;
    }

    // Enforce per-role limits if provided
    if (roleLimits) {
      const role = idToRole.get(playerId);
      if (role) {
        const limit = roleLimits[role];
        if (typeof limit === "number") {
          const current = selectedCountByRole[role] || 0;
          if (current >= limit) {
            onBlockedSelect?.(`You can select at most ${limit} players for ${role}.`);
            return;
          }
        }
      }
    }

    onPlayerSelect(playerId);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {playersPrepared.map((player) => (
        <PlayerCard
          key={player.id}
          player={player}
          isSelected={selectedPlayers.includes(player.id)}
          isCaptain={player.id === captainId}
          isViceCaptain={player.id === viceCaptainId}
          onSelect={handleSelect}
          onSetCaptain={onSetCaptain}
          onSetViceCaptain={onSetViceCaptain}
          showActions={showActions}
          compact={compact}
          displayRoleMap={displayRoleMap}
          compactShowPrice={compactShowPrice}
        />
      ))}
    </div>
  );
};

export { PlayerCard, PlayerList };
export type { Player, PlayerCardProps, PlayerListProps };
