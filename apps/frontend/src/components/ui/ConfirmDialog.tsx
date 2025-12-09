"use client";

import React from "react";

export type ConfirmDialogProps = {
  open: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title = "Confirm Action",
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !loading && onCancel()}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl border border-primary-200">
        <div className="p-5 sm:p-6">
          <div className="mb-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-primary text-white text-xs font-semibold shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
            {title}
          </div>
          {description && (
            <p className="mt-1 text-sm text-gray-700">{description}</p>
          )}
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => !loading && onCancel()}
              className="px-4 py-2 rounded-full text-sm font-medium text-text-main hover:bg-bg-card-soft border border-border-subtle disabled:opacity-60"
              disabled={loading}
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={() => !loading && onConfirm()}
              className={[
                "px-5 py-2.5 rounded-full text-sm font-semibold text-white shadow",
                destructive
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-gradient-brand hover:shadow-pink-soft",
                loading ? "opacity-70" : "",
              ].join(" ")}
              disabled={loading}
            >
              {loading ? "Working..." : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
