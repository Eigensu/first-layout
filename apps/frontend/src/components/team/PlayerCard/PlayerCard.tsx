import * as React from "react";
import { Avatar } from "../../ui/Avatar";
import { Badge } from "../../ui/Badge";
import { Card } from "../../ui/Card";
import { Flame } from "lucide-react";
import type { Player, PlayerCardProps } from "./types.js";

const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  isSelected,
  isCaptain = false,
  isViceCaptain = false,
  onSelect,
  onSetCaptain,
  onSetViceCaptain,
  onReplace,
  showActions = false,
  compact = false,
  className = "",
  compactShowPrice = false,
  disabled = false,
  variant = "default",
}) => {
  // Visual accent based on team initial; simple deterministic color
  const getAvatarGradient = () => undefined;

  if (compact) {
    return (
      <div
        className={`
          flex items-center gap-2 sm:gap-3 p-2 sm:p-4 rounded-xl border-2 transition-all
          ${
            disabled && !isSelected
              ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
              : isSelected
                ? "border-primary-400 bg-primary-900/90 text-white cursor-pointer shadow-sm"
                : "border-gray-200 hover:border-gray-300 bg-white cursor-pointer hover:shadow-sm"
          }
          ${className}
        `}
        onClick={() => !disabled && onSelect(player.id)}
      >
        {/* Player Avatar - Responsive size */}
        <Avatar
          name={player.name}
          src={player.image}
          size="sm"
          gradientClassName={getAvatarGradient()}
        />

        {/* Player Info */}
        <div className="flex-1 min-w-0">
          <h4
            className={`font-semibold text-xs sm:text-base truncate ${isSelected ? "text-white" : "text-gray-900"}`}
          >
            {player.name}
          </h4>
          <div className="flex items-center gap-1.5 sm:gap-2 mt-0 sm:mt-1">
            <span className="text-[10px] sm:text-xs text-gray-500 flex items-center gap-1">
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              {player.team}
            </span>
            {player.slotLabel && (
              <Badge variant="secondary" size="sm">
                {player.slotLabel}
              </Badge>
            )}
            {player.isHot && (
              <Badge
                variant="error"
                size="sm"
                className="flex items-center gap-1 bg-amber-200 text-red-800 border border-red-300 shadow-sm"
              >
                <Flame className="w-3 h-3 text-red-700" strokeWidth={2} />
                <span className="hidden sm:inline">Most Picked</span>
              </Badge>
            )}
          </div>
        </div>

        {/* Right Side: Score and Checkbox */}
        <div className="flex flex-col items-end gap-0.5 sm:gap-1">
          <div
            className={`
              w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center transition-all
              ${isSelected ? "bg-primary-500 border-primary-500 scale-110" : "border-gray-300"}
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
      </div>
    );
  }

  return (
    <Card
      className={`
        relative transition-all duration-300
        ${
          disabled && !isSelected
            ? "border-2 border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
            : isSelected
              ? "cursor-pointer border-2 border-primary-500 bg-primary-600 hover:shadow-medium"
              : "cursor-pointer border-2 border-gray-200 hover:border-gray-300 hover:shadow-medium"
        }
        ${className}
      `}
      onClick={() => !disabled && onSelect(player.id)}
    >
      {/* Captain/Vice-Captain Badges */}
      {isCaptain && (
        <div className="absolute top-0 right-0 z-10 p-1">
          <Badge
            variant="warning"
            size="sm"
            className="shadow-md text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5"
          >
            <span className="hidden sm:inline">Captain (2x)</span>
            <span className="sm:hidden">C (2x)</span>
          </Badge>
        </div>
      )}
      {isViceCaptain && (
        <div className="absolute top-0 right-0 z-10 p-1">
          <Badge
            variant="secondary"
            size="sm"
            className="shadow-md text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5"
          >
            <span className="hidden sm:inline">Vice Captain (1.5x)</span>
            <span className="sm:hidden">VC (1.5x)</span>
          </Badge>
        </div>
      )}

      <div className={`p-3 ${variant === "captain" ? "sm:p-3" : "sm:p-4"}`}>
        {/* Player Header */}
        <div
          className={`flex items-center justify-between ${variant === "captain" ? "mb-2" : "mb-3 sm:mb-4"}`}
        >
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Avatar
              name={player.name}
              src={player.image}
              size={variant === "captain" ? "lg" : "md"}
              gradientClassName={getAvatarGradient()}
            />

            <div>
              <h4
                className={`font-semibold ${variant === "captain" ? "text-sm sm:text-base" : "text-sm sm:text-base"} ${isSelected ? "text-white" : "text-gray-900"}`}
              >
                {player.name}
              </h4>
              <div className="flex items-center space-x-1.5 sm:space-x-2 mt-0.5 sm:mt-1">
                {player.slotLabel && (
                  <Badge
                    size="sm"
                    className="text-[10px] sm:text-xs px-1 sm:px-2 py-0 sm:py-0.5"
                  >
                    {player.slotLabel}
                  </Badge>
                )}
                <span
                  className={`text-xs sm:text-sm ${isSelected ? "text-white/80" : "text-gray-500"}`}
                >
                  {player.team}
                </span>
                {player.isHot && (
                  <Badge
                    variant="error"
                    size="sm"
                    className="text-[10px] sm:text-xs px-1 sm:px-2 py-0 sm:py-0.5 flex items-center gap-1 bg-amber-200 text-red-800 border border-red-300 shadow-sm"
                  >
                    <Flame className="w-3 h-3 text-red-700" strokeWidth={2} />
                    <span className="hidden sm:inline">Most Picked</span>
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Selection Indicator */}
          <div
            className={`
            w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center transition-all
            ${isSelected ? "bg-primary-500 border-primary-500 scale-110" : "border-gray-300"}
          `}
          >
            {isSelected && (
              <svg
                className="w-3 h-3 sm:w-4 sm:h-4 text-white"
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
        {variant === "captain" ? (
          <div className="mb-2 sm:mb-3">
            <div className="text-center">
              <div className="text-lg font-bold text-success-600">
                {player.points}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-500">
                Fantasy Points
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="text-center">
              <div className="text-base sm:text-lg font-bold text-success-600">
                {player.points}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-500">
                Fantasy Points
              </div>
            </div>
            <div className="text-center">
              <div
                className={`text-base sm:text-lg font-bold ${isSelected ? "text-white" : "text-gray-900"}`}
              >
                ₹{Math.floor(player.price)}
              </div>
              <div
                className={`text-[10px] sm:text-xs ${isSelected ? "text-white/70" : "text-gray-500"}`}
              >
                Price
              </div>
            </div>
          </div>
        )}

        {/* Additional Stats */}
        {player.stats && variant !== "captain" && (
          <div className="grid grid-cols-3 gap-2 pt-2 sm:pt-3 border-t border-gray-100">
            <div className="text-center">
              <div
                className={`text-sm sm:text-base font-medium ${isSelected ? "text-white" : "text-gray-900"}`}
              >
                {player.stats.matches}
              </div>
              <div
                className={`text-[10px] sm:text-xs ${isSelected ? "text-white/70" : "text-gray-500"}`}
              >
                Matches
              </div>
            </div>
            {player.stats.runs && (
              <div className="text-center">
                <div
                  className={`text-sm sm:text-base font-medium ${isSelected ? "text-white" : "text-gray-900"}`}
                >
                  {player.stats.runs}
                </div>
                <div
                  className={`text-[10px] sm:text-xs ${isSelected ? "text-white/70" : "text-gray-500"}`}
                >
                  Runs
                </div>
              </div>
            )}
            {player.stats.wickets && (
              <div className="text-center">
                <div className="text-sm sm:text-base font-medium text-gray-900">
                  {player.stats.wickets}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500">
                  Wickets
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {showActions && isSelected && (
          <div className={`mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-gray-100`}>
            {onReplace && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReplace(player.id);
                }}
                className="w-full mb-2 px-3 py-2 sm:py-1.5 text-xs sm:text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100"
              >
                Replace
              </button>
            )}
            <div className="flex flex-row gap-2">
              {onSetCaptain && !isCaptain && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetCaptain(player.id);
                  }}
                  className="flex-1 px-3 py-2 sm:py-1.5 text-xs sm:text-sm font-bold text-orange-600 bg-white border border-orange-300 rounded-lg hover:bg-orange-50 transition-colors shadow-sm"
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
                  className="flex-1 px-3 py-2 sm:py-1.5 text-xs sm:text-sm font-bold text-purple-600 bg-white border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors shadow-sm"
                >
                  Make V.Captain
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export { PlayerCard };
