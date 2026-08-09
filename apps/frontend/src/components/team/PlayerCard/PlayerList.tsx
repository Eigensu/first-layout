import * as React from "react";
import { PlayerCard } from "./PlayerCard";
import { SearchInput } from "./SearchInput";
import { Pagination } from "./Pagination";
import { POOL_SORTS, type PlayerListProps, type PoolSort } from "./types";
import { playerValueLabel } from "@/utils/playerValue";
import { PRICE_RANGES } from "./priceRanges";

const PLAYERS_PER_PAGE = 20;

const ALL_TEAMS = "__all__";

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
  getDisabledReason,
  showPoolFilters = false,
  contestFormat,
}) => {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [teamFilter, setTeamFilter] = React.useState<string>(ALL_TEAMS);
  const [sort, setSort] = React.useState<PoolSort>(POOL_SORTS.VALUE_DESC);
  const [priceRangeIndex, setPriceRangeIndex] = React.useState<number | null>(null);

  const canSelectMoreTotal = selectedPlayers.length < maxSelections;

  const teamOptions = React.useMemo(() => {
    const names = new Set<string>();
    players.forEach((p) => {
      if (p.team) names.add(p.team);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [players]);

  const playersPrepared = React.useMemo(() => {
    let list = players.slice();

    // Apply slot filter
    if (typeof filterSlot === "number") {
      list = list.filter((p: any) => p.slot === filterSlot);
    }

    // Apply real-world team filter
    if (showPoolFilters && teamFilter !== ALL_TEAMS) {
      list = list.filter((p) => p.team === teamFilter);
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
          p.team.toLowerCase().includes(query),
      );
    }

    if (showPoolFilters) {
      const bySort: Record<PoolSort, (a: typeof list[0], b: typeof list[0]) => number> = {
        [POOL_SORTS.VALUE_DESC]: (a, b) => b.price - a.price,
        [POOL_SORTS.VALUE_ASC]: (a, b) => a.price - b.price,
        [POOL_SORTS.POINTS_DESC]: (a, b) => b.points - a.points,
        [POOL_SORTS.NAME_ASC]: (a, b) => a.name.localeCompare(b.name),
      };
      list.sort(bySort[sort]);
    }

    return list;
  }, [players, filterSlot, searchQuery, showPoolFilters, teamFilter, sort, priceRangeIndex]);

  // Reset to page 1 when search or filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterSlot, teamFilter, sort, priceRangeIndex]);

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
        `You can select at most ${maxSelections} players in total.`,
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

      {/* Open-pool filters: by real-world team, and by value or points */}
      {showPoolFilters && (
        <div className="flex gap-1.5 sm:gap-2">
          <label className="flex-1 min-w-0">
            <span className="sr-only">Filter by team</span>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-bg-card text-text-main px-2 py-1.5 text-[11px] sm:text-sm"
            >
              <option value={ALL_TEAMS}>All teams</option>
              {teamOptions.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 min-w-0">
            <span className="sr-only">Sort players</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as PoolSort)}
              className="w-full rounded-lg border border-border-subtle bg-bg-card text-text-main px-2 py-1.5 text-[11px] sm:text-sm"
            >
              <option value={POOL_SORTS.VALUE_DESC}>
                {playerValueLabel(contestFormat)}: high to low
              </option>
              <option value={POOL_SORTS.VALUE_ASC}>
                {playerValueLabel(contestFormat)}: low to high
              </option>
              <option value={POOL_SORTS.POINTS_DESC}>Fantasy points</option>
              <option value={POOL_SORTS.NAME_ASC}>Name (A–Z)</option>
            </select>
          </label>
        </div>
      )}

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
              {range.label}
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
              contestFormat={contestFormat}
              disabled={isPlayerDisabled ? isPlayerDisabled(player) : false}
              disabledReason={getDisabledReason?.(player) ?? undefined}
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
