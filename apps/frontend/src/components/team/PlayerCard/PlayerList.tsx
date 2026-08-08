import * as React from "react";
import { PlayerCard } from "./PlayerCard";
import { SearchInput } from "./SearchInput";
import { Pagination } from "./Pagination";
import type { PlayerListProps } from "./types";

const PLAYERS_PER_PAGE = 10;

interface PriceRange {
  label: string;
  min: number;
  max: number;
}

const PRICE_RANGES: PriceRange[] = [
  { label: "40L – 16L",     min: 1_600_000, max: 4_000_000 },
  { label: "15.99L – 61K",  min:    61_000, max: 1_599_000 },
  { label: "60.99K – 21K",  min:    21_000, max:    60_990 },
  { label: "20.99K – 10K",  min:    10_000, max:    20_990 },
  { label: "9.99K – 5K",   min:     5_000, max:     9_990 },
];

export const PlayerList: React.FC<PlayerListProps> = ({
  players,
  selectedPlayers,
  captainId,
  viceCaptainId,
  onPlayerSelect,
  onSetCaptain,
  onSetViceCaptain,
  maxSelections = 16,
  filterSlot,
  onBlockedSelect,
  showActions = false,
  compact = false,
  className = "",
  compactShowPrice = false,
  isPlayerDisabled,
}) => {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [priceRangeIndex, setPriceRangeIndex] = React.useState<number | null>(null);

  const canSelectMoreTotal = selectedPlayers.length < maxSelections;

  const playersPrepared = React.useMemo(() => {
    let list = players.slice();

    // Apply slot filter
    if (typeof filterSlot === "number") {
      list = list.filter((p: any) => p.slot === filterSlot);
    }

    // Apply price range filter
    if (priceRangeIndex !== null) {
      const { min, max } = PRICE_RANGES[priceRangeIndex];
      list = list.filter((p) => p.price >= min && p.price <= max);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.team.toLowerCase().includes(query)
      );
    }
    return list;
  }, [players, filterSlot, searchQuery, priceRangeIndex]);

  // Reset to page 1 when search or filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterSlot, priceRangeIndex]);

  // Calculate pagination
  const totalPlayers = playersPrepared.length;
  const totalPages = Math.ceil(totalPlayers / PLAYERS_PER_PAGE);
  const startIndex = (currentPage - 1) * PLAYERS_PER_PAGE;
  const endIndex = startIndex + PLAYERS_PER_PAGE;
  const paginatedPlayers = playersPrepared.slice(startIndex, endIndex);

  const handleSelect = (playerId: string) => {
    const already = selectedPlayers.includes(playerId);
    if (already) return onPlayerSelect(playerId);
    if (!canSelectMoreTotal) {
      onBlockedSelect?.(
        `You can select at most ${maxSelections} players in total.`
      );
      return;
    }
    onPlayerSelect(playerId);
  };

  const handlePriceChip = (idx: number) => {
    setPriceRangeIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <div className={`space-y-1.5 sm:space-y-3 ${className}`}>
      {/* Search Input */}
      <SearchInput searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      {/* Price Range Filter Chips */}
      <div className="flex overflow-x-auto gap-1.5 pb-0.5 -mx-1 px-1 scrollbar-hide">
        {PRICE_RANGES.map((range, idx) => {
          const isActive = priceRangeIndex === idx;
          return (
            <button
              key={range.label}
              onClick={() => handlePriceChip(idx)}
              className={`
                flex-shrink-0 rounded-full px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-medium
                border transition-all duration-150 whitespace-nowrap
                ${
                  isActive
                    ? "bg-primary-600 border-primary-600 text-white shadow-sm"
                    : "bg-white border-gray-300 text-gray-600 hover:border-primary-400 hover:text-primary-600"
                }
              `}
            >
              ₹{range.label}
            </button>
          );
        })}
      </div>

      {/* Player Count */}
      <div className="text-[10px] sm:text-sm text-text-main font-medium ml-1">
        Showing {paginatedPlayers.length} of {totalPlayers} player
        {totalPlayers !== 1 ? "s" : ""}
      </div>

      {/* Players List */}
      {paginatedPlayers.length > 0 ? (
        <>
          {paginatedPlayers.map((player) => (
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
              compactShowPrice={compactShowPrice}
              disabled={isPlayerDisabled ? isPlayerDisabled(player) : false}
            />
          ))}

          {/* Pagination Controls */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      ) : (
        <div className="text-center py-8 text-text-muted">
          No players found matching your search.
        </div>
      )}
    </div>
  );
};
