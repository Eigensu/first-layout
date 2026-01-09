import React from "react";
import { Button } from "@/components";

interface TeamNameDialogProps {
  open: boolean;
  onClose: () => void;
  teamName: string;
  onTeamNameChange: (name: string) => void;
  onConfirm: () => void;
}

export const TeamNameDialog: React.FC<TeamNameDialogProps> = ({
  open,
  onClose,
  teamName,
  onTeamNameChange,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-2xl bg-bg-elevated shadow-xl border border-border-subtle">
        <div className="p-5 sm:p-6">
          <div className="mb-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-brand text-white text-xs font-semibold shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
            Required
          </div>
          <h3 className="text-lg sm:text-xl font-semibold text-text-main">
            Please enter a team name
          </h3>
          <p className="mt-2 text-sm text-text-muted">
            You need a name to create and enroll your team.
          </p>

          <div className="mt-4">
            <input
              type="text"
              value={teamName}
              onChange={(e) => onTeamNameChange(e.target.value)}
              placeholder="e.g., Golden Strikers"
              className="w-full rounded-xl border border-border-subtle bg-bg-card px-4 py-2.5 text-text-main placeholder:text-text-muted focus:outline-none focus:ring-4 focus:ring-accent-pink-soft/30 focus:border-accent-pink-soft"
            />
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-sm font-medium text-text-main hover:bg-bg-elevated border border-border-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (teamName.trim()) {
                  onConfirm();
                }
              }}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-gradient-brand shadow hover:shadow-pink-soft"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
