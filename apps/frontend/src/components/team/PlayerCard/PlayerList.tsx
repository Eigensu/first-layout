import * as React from "react";
import { PlayerCard } from "./PlayerCard";
import { SearchInput } from "./SearchInput";
import { Pagination } from "./Pagination";
import type { PlayerListProps } from "./types";

const PLAYERS_PER_PAGE = 10;

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

  const canSelectMoreTotal = selectedPlayers.length < maxSelections;

  const playersPrepared = React.useMemo(() => {
    let list = players.slice();

    // Apply slot filter
    if (typeof filterSlot === "number") {
      list = list.filter((p: any) => p.slot === filterSlot);
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
  }, [players, filterSlot, searchQuery]);

  // Reset to page 1 when search or filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterSlot]);

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

  return (
    <div className={`space-y-1.5 sm:space-y-3 ${className}`}>
      {/* Search Input */}
      <SearchInput searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      {/* Player Count */}
      <div className="text-[10px] sm:text-sm text-gray-600 font-medium ml-1">
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
        <div className="text-center py-8 text-gray-500">
          No players found matching your search.
        </div>
      )}
    </div>
  );
};
