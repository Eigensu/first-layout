import React from "react";
import { Button, Avatar, Player } from "@/components";
import { formatPoints } from "@/lib/utils";

interface ReplacePlayerModalProps {
  open: boolean;
  onClose: () => void;
  targetPlayerId: string;
  players: Player[];
  selectedPlayers: string[];
  onConfirm: (newPlayerId: string) => void;
}

export const ReplacePlayerModal: React.FC<ReplacePlayerModalProps> = ({
  open,
  onClose,
  targetPlayerId,
  players,
  selectedPlayers,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-bg-elevated rounded-xl shadow-xl w-full max-w-2xl border border-border-subtle">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold text-gray-900">Replace Player</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-3">
          {(() => {
            const target = players.find((p) => p.id === targetPlayerId);
            const slotId = (target as any)?.slotId;
            const candidates = players.filter(
              (p) =>
                (p as any).slotId === slotId && !selectedPlayers.includes(p.id)
            );
            if (!target)
              return <div className="text-text-muted">No player selected.</div>;
            return (
              <div className="space-y-2">
                <div className="text-sm text-text-muted">
                  Replacing{" "}
                  <span className="font-medium text-text-main">
                    {target.name}
                  </span>
                  . Choose a replacement from the same slot.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {candidates.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onConfirm(p.id)}
                      className="flex items-center gap-3 p-3 border rounded-lg border-border-subtle hover:bg-bg-elevated text-left"
                    >
                      <Avatar name={p.name} size="sm" />
                      <div className="flex-1">
                        <div className="font-medium text-text-main">
                          {p.name}
                        </div>
                        <div className="text-xs text-text-muted">{p.team}</div>
                      </div>
                      <div className="text-right text-sm text-success-600">
                        {formatPoints(p.points || 0)} pts
                      </div>
                    </button>
                  ))}
                  {candidates.length === 0 && (
                    <div className="text-sm text-gray-500">
                      No available players in this slot.
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
        <div className="px-5 py-3 border-t flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
