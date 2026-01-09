import React from "react";
import { Player } from "@/components";

interface SelectedPlayersBarProps {
  selectedPlayersCount: number;
  totalMax: number;
  selectedPlayerObjs: Player[];
  onPlayerRemove: (playerId: string) => void;
}

export const SelectedPlayersBar: React.FC<SelectedPlayersBarProps> = ({
  selectedPlayersCount,
  totalMax,
  selectedPlayerObjs,
  onPlayerRemove,
}) => {
  return (
    <div className="sticky top-14 z-40 px-2 sm:px-4 pt-2 pb-1 sm:py-2 -mt-10">
      <div className="max-w-6xl mx-auto">
        <div className="bg-bg-card/90 backdrop-blur-sm rounded-xl sm:rounded-2xl md:rounded-3xl shadow-lg border border-border-subtle p-1.5 sm:p-3 md:p-4">
          {/* Mobile: Horizontal layout */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h5 className="font-bold text-text-main text-xs">
                Selected Players
              </h5>
              <div className="px-1.5 py-0 rounded-full text-[9px] font-bold bg-gradient-brand text-white shadow-sm">
                {selectedPlayersCount}/{totalMax || 0}
              </div>
            </div>
            <div>
              {selectedPlayerObjs.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {selectedPlayerObjs.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => onPlayerRemove(player.id)}
                      className="flex-shrink-0 px-1 py-0.5 border border-border-subtle rounded-full hover:bg-bg-elevated hover:border-accent-pink-soft transition-all duration-200 text-[8px] sm:text-[9px] font-medium text-text-main whitespace-nowrap bg-bg-card shadow-sm"
                      title="Tap to remove"
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-gray-500 italic">
                  No players selected yet
                </p>
              )}
            </div>
          </div>

          {/* Desktop: Vertical layout */}
          <div className="hidden sm:flex items-start gap-3 md:gap-4">
            <div className="flex flex-col gap-1 flex-shrink-0">
              <h5 className="font-bold text-text-main text-base md:text-lg">
                Selected Players
              </h5>
              <div className="px-2.5 py-1 rounded-full text-xs font-bold bg-gradient-brand text-white shadow-sm w-fit ml-8 md:ml-10">
                {selectedPlayersCount}/{totalMax || 0}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              {selectedPlayerObjs.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedPlayerObjs.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => onPlayerRemove(player.id)}
                      className="flex-shrink-0 px-3 md:px-4 py-1.5 md:py-2 border-2 border-border-subtle rounded-full hover:bg-bg-elevated hover:border-accent-pink-soft transition-all duration-200 text-xs md:text-sm font-medium text-text-main whitespace-nowrap bg-bg-card shadow-sm"
                      title="Tap to remove"
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs md:text-sm text-text-muted italic">
                  No players selected yet
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
