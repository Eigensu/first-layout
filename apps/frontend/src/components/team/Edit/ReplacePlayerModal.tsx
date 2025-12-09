"use client";

import React, { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "./SearchInput";
import { PlayerListItem, type EditPlayer } from "./PlayerListItem";

interface ReplacePlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPlayerId?: string;
  players: EditPlayer[];
  /** Optional list of player IDs to exclude (e.g., already on team) */
  excludeIds?: string[];
  /** Optional filter fn (e.g., same-slot only). If omitted, shows all players */
  filter?: (p: EditPlayer) => boolean;
  onSelect: (playerId: string) => void;
}

export const ReplacePlayerModal: React.FC<ReplacePlayerModalProps> = ({
  isOpen,
  onClose,
  targetPlayerId,
  players,
  excludeIds = [],
  filter,
  onSelect,
}) => {
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const excluded = new Set(excludeIds);
    let arr = players.filter((p) => !excluded.has(p.id));
    if (filter) arr = arr.filter(filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.team || "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [players, excludeIds, filter, query]);

  if (!isOpen) return null;

  const target = players.find((p) => p.id === targetPlayerId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-bg-card rounded-xl shadow-pink-soft border border-border-subtle w-full max-w-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <h3 className="font-semibold text-text-main">Replace Player</h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-main"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <SearchInput value={query} onChange={setQuery} autoFocus />
          {target && (
            <div className="text-xs text-text-muted">
              Replacing{" "}
              <span className="font-medium text-text-main">{target.name}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
            {list.map((p) => (
              <PlayerListItem
                key={p.id}
                player={p}
                subtitle={`${p.role || "Slot"} • ${p.team || ""}`}
                onClick={() => onSelect(p.id)}
              />
            ))}
            {list.length === 0 && (
              <div className="text-sm text-text-muted">
                No players match your search.
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border-subtle flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
