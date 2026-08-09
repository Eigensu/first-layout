"use client";

import React from "react";
import { Avatar } from "@/components/ui/Avatar";

export type EditPlayer = {
  id: string;
  name: string;
  team?: string;
  role?: string;
  points?: number;
  /** Auction sale value. Ignored in slot-based contests. */
  price?: number;
};

interface PlayerListItemProps {
  player: EditPlayer;
  subtitle?: string;
  rightText?: string;
  /** Why the row is disabled. Rendered inline — a tooltip never reaches touch. */
  note?: string;
  disabled?: boolean;
  onClick?: (playerId: string) => void;
}

export const PlayerListItem: React.FC<PlayerListItemProps> = ({
  player,
  subtitle,
  rightText,
  note,
  disabled,
  onClick,
}) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onClick?.(player.id)}
      className={`flex items-center gap-3 p-3 border rounded-lg text-left transition-colors w-full ${
        disabled
          ? "bg-bg-card-soft border-border-subtle text-text-subtle cursor-not-allowed"
          : "bg-bg-card hover:bg-bg-card-soft border-border-subtle text-text-main"
      }`}
    >
      <Avatar name={player.name} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-text-main truncate">{player.name}</div>
        <div className="text-xs text-text-muted truncate">{subtitle}</div>
        {note && (
          <div className="text-[10px] text-warning truncate">{note}</div>
        )}
      </div>
      {rightText && (
        <div className="text-right text-sm font-semibold text-accent-pink-500 tabular-nums whitespace-nowrap">
          {rightText}
        </div>
      )}
    </button>
  );
};
