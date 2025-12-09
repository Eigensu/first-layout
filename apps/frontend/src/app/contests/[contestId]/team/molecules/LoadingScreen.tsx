"use client";

import React from "react";

export function LoadingScreen({
  message = "Loading contest team data…",
}: {
  message?: string;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-bg-body"
      aria-busy
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
        <p className="text-sm text-text-muted">{message}</p>
      </div>
    </div>
  );
}
