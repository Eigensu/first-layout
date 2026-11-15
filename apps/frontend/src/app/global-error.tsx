"use client";

import "./globals.css";

import { useEffect } from "react";

import { captureError } from "@/lib/analytics/posthog";

/**
 * The app's last error boundary: an error thrown while rendering any page
 * (no segment has an error.tsx of its own) ends up here instead of Next's
 * blank "Application error" screen, and is sent to PostHog with the session
 * it happened in. It replaces the root layout, so it brings its own html.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { source: "react_error_boundary", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased bg-bg-body text-text-main">
        <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-text-muted">
            We have been told about it. Try again, or go back to the home page.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={reset}
              className="bg-gradient-button-primary text-text-main font-semibold px-6 py-2.5 rounded-full transition-transform hover:scale-105 text-sm"
            >
              Try again
            </button>
            {/* A plain link: the router itself may be what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="px-6 py-2.5 rounded-full border border-current text-sm font-semibold">
              Home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
