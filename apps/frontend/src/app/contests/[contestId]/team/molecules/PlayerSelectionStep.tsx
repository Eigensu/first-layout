import React from "react";
import { StepCard, Badge, Button, PlayerList, Player } from "@/components";

interface PlayerSelectionStepProps {
  currentStep: number;
  isStep1Collapsed: boolean;
  onExpand: () => void;
  isCompleted: boolean;

  // Data
  slots: any[];
  players: Player[];
  selectedPlayers: string[];
  activeSlotId: string;
  loading: boolean;
  error: string | null;

  // Limits
  selectedCountBySlot: Record<string, number>;
  slotLimits: Record<string, number>;
  totalMax: number;

  // Handlers
  onClearAll: () => void;
  onSetActiveSlot: (slotId: string) => void;
  onPlayerSelect: (playerId: string) => void;
  onBlockSelect: (reason: string) => void;
  onNextSlot: () => void;
  onPrevSlot: () => void;
  onContinue: () => void;

  // State helpers
  isFirstSlot: boolean;
  canNextForActiveSlot: boolean;
  isLastSlot: boolean;
}

export const PlayerSelectionStep: React.FC<PlayerSelectionStepProps> = ({
  currentStep,
  isStep1Collapsed,
  onExpand,
  isCompleted,

  slots,
  players,
  selectedPlayers,
  activeSlotId,
  loading,
  error,

  selectedCountBySlot,
  slotLimits,
  totalMax,

  onClearAll,
  onSetActiveSlot,
  onPlayerSelect,
  onBlockSelect,
  onNextSlot,
  onPrevSlot,
  onContinue,

  isFirstSlot,
  canNextForActiveSlot,
  isLastSlot,
}) => {
  return (
    <StepCard
      stepNumber={1}
      title="Select Players"
      description=""
      isActive={currentStep === 1}
      isCompleted={isCompleted}
    >
      {isStep1Collapsed && currentStep > 1 ? (
        <div
          className="cursor-pointer hover:bg-bg-elevated p-3 sm:p-4 rounded-lg transition-all duration-200"
          onClick={onExpand}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
              {slots.map((s) => {
                const count = selectedCountBySlot[s.id] || 0;
                const limit = slotLimits[s.id] || 4;
                return (
                  <Badge
                    key={s.id}
                    variant={count >= limit ? "success" : "secondary"}
                    size="sm"
                    className="justify-center"
                  >
                    {s.name}: {count}/{limit}
                  </Badge>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm sm:text-base text-text-muted">
                <span className="font-semibold text-text-main">
                  {selectedPlayers.length} players
                </span>{" "}
                selected
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary-600 hover:text-primary-700"
              >
                Edit Selection
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-4">
          <div className="flex flex-row justify-between items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
            <h4 className="font-semibold text-text-main text-xs sm:text-base">
              Players Selected: {selectedPlayers.length}/{totalMax || 12}
            </h4>
            <Button
              variant="primary"
              size="sm"
              onClick={onClearAll}
              className="flex-shrink-0 text-[10px] sm:text-sm px-2 sm:px-4 h-7 sm:h-8"
            >
              Clear All
            </Button>
          </div>
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-500/10 text-amber-500 px-2 sm:px-3 py-1.5 sm:py-2.5 text-xs sm:text-sm">
            {(() => {
              const mins = Array.from(new Set(slots.map((s) => s.min_select)));
              if (mins.length === 1) {
                return `Select ${mins[0]} players in each Slot and press Next to proceed.`;
              }
              return `Meet the minimum required players in each Slot and press Next to proceed.`;
            })()}
          </div>
          {/* Player list - now full width */}{" "}
          <div>
            <div className="flex overflow-x-auto gap-1.5 mb-2 sm:mb-4 pb-1 -mx-2 px-2 scrollbar-hide">
              {slots.map((s) => {
                const limit = slotLimits[s.id];
                const count = selectedCountBySlot[s.id] || 0;
                const isActive = activeSlotId === s.id;
                return (
                  <Button
                    key={s.id}
                    variant={isActive ? "primary" : "ghost"}
                    size="sm"
                    onClick={() => onSetActiveSlot(s.id)}
                    className="rounded-full flex-shrink-0 text-white h-7 text-xs px-3"
                  >
                    {s.name}
                    {limit !== undefined && (
                      <span
                        className={`ml-1.5 text-[10px] sm:text-xs ${isActive ? "text-white/90" : "text-gray-300"}`}
                      >
                        {count || 0}/{limit}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>

            {loading ? (
              <div className="text-center text-gray-500 py-6">
                Loading players...
              </div>
            ) : error ? (
              <div className="text-center text-red-600 py-6">{error}</div>
            ) : (
              <PlayerList
                key={`slot-${activeSlotId}`}
                players={
                  players.filter(
                    (p) => (p as any).slotId === activeSlotId
                  ) as unknown as Player[]
                }
                selectedPlayers={selectedPlayers}
                onPlayerSelect={onPlayerSelect}
                maxSelections={totalMax || 0}
                onBlockedSelect={onBlockSelect}
                compact={true}
                compactShowPrice={false}
                isPlayerDisabled={(player) => {
                  if (selectedPlayers.includes(player.id)) {
                    return false;
                  }
                  const playerSlotId = (
                    players.find((p) => p.id === player.id) as any
                  )?.slotId as string | undefined;
                  if (!playerSlotId) return false;
                  const currentSlotCount = selectedPlayers.filter((id) => {
                    const p = players.find((mp) => mp.id === id) as any;
                    return p?.slotId === playerSlotId;
                  }).length;
                  const limit = slotLimits[playerSlotId] || 4;
                  return currentSlotCount >= limit;
                }}
              />
            )}

            {isLastSlot ? (
              <div className="flex items-center justify-center mt-6">
                <div className="flex gap-3 w-full sm:w-auto">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={onPrevSlot}
                    disabled={isFirstSlot}
                    className="flex-1 sm:flex-none"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={onContinue}
                    disabled={!canNextForActiveSlot}
                    className="flex-1 sm:flex-none"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center mt-6">
                <div className="flex gap-3 w-full sm:w-auto">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={onPrevSlot}
                    disabled={isFirstSlot}
                    className="flex-1 sm:flex-none"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={onNextSlot}
                    disabled={!canNextForActiveSlot}
                    className="flex-1 sm:flex-none"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </StepCard>
  );
};
