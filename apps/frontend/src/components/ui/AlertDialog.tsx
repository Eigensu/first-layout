"use client";

import React from "react";

export type AlertDialogProps = {
  open: boolean;
  title?: string;
  message: string;
  buttonText?: string;
  onClose: () => void;
};

export function AlertDialog({
  open,
  title = "Notice",
  message,
  buttonText = "OK",
  onClose,
}: AlertDialogProps) {
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
      <div className="relative w-full max-w-md rounded-2xl bg-bg-card shadow-xl border border-border-subtle">
        <div className="p-5 sm:p-6">
          <div className="mb-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-brand text-white text-xs font-semibold shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
            {title}
          </div>
          <p className="mt-1 text-sm text-text-muted whitespace-pre-line">
            {message}
          </p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-gradient-brand shadow hover:shadow-pink-soft"
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
