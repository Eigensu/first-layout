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

  if (compact) {
    return (
      <div
        className={`
          flex items-center space-x-3 p-3 rounded-xl border-2 cursor-pointer transition-all
          ${
            isSelected
              ? "border-primary-300 bg-primary-50"
              : "border-gray-200 hover:border-gray-300 bg-white"
          }
          ${className}
        `}
        onClick={() => onSelect(player.id)}
      >
        <Avatar name={player.name} src={player.image} size="sm" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900 truncate">
              {player.name}
            </h4>
            <span className="text-sm font-medium text-success-600">
              {player.points} pts
            </span>
          </div>
          <div className="flex items-center space-x-2 mt-1">
            <Badge variant={getRoleBadgeVariant(player.role)} size="sm">
              {player.role}
            </Badge>
            <span className="text-xs text-gray-500">{player.team}</span>
          </div>
        </div>

        <div
          className={`
          w-5 h-5 rounded-full border-2 flex items-center justify-center
          ${isSelected ? "bg-primary-500 border-primary-500" : "border-gray-300"}
        `}
        >
          {isSelected && (
            <svg
              className="w-3 h-3 text-white"
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
    );
  }

  return (
    <Card
      className={`
        relative cursor-pointer border-2 transition-all duration-300 hover:shadow-medium
        ${
          isSelected
            ? "border-primary-300 bg-gradient-to-br from-primary-50 to-white"
            : "border-gray-200 hover:border-gray-300"
        }
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
            <Avatar name={player.name} src={player.image} size="lg" />

            <div>
              <h4 className="font-semibold text-gray-900">{player.name}</h4>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant={getRoleBadgeVariant(player.role)} size="sm">
                  {player.role}
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
            {onSetViceCaptain && !isViceCaptain && !isCaptain && (
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
  maxSelections?: number;
  showActions?: boolean;
  compact?: boolean;
  className?: string;
}

const PlayerList: React.FC<PlayerListProps> = ({
  players,
  selectedPlayers,
  captainId,
  viceCaptainId,
  onPlayerSelect,
  onSetCaptain,
  onSetViceCaptain,
  maxSelections = 11,
  showActions = false,
  compact = false,
  className = "",
}) => {
  const canSelectMore = selectedPlayers.length < maxSelections;

  return (
    <div className={`space-y-4 ${className}`}>
      {players.map((player) => (
        <PlayerCard
          key={player.id}
          player={player}
          isSelected={selectedPlayers.includes(player.id)}
          isCaptain={player.id === captainId}
          isViceCaptain={player.id === viceCaptainId}
          onSelect={(playerId) => {
            if (selectedPlayers.includes(playerId) || canSelectMore) {
              onPlayerSelect(playerId);
            }
          }}
          onSetCaptain={onSetCaptain}
          onSetViceCaptain={onSetViceCaptain}
          showActions={showActions}
          compact={compact}
        />
      ))}
    </div>
  );
};

export { PlayerCard, PlayerList };
export type { Player, PlayerCardProps, PlayerListProps };
