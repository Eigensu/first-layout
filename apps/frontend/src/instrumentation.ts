import type { Instrumentation } from "next";

export function register(): void {}

/**
 * Errors thrown while the server renders a page or runs a route handler, to
 * PostHog Error Tracking (docs/POSTHOG_OBSERVABILITY.md). The browser's
 * PostHog cookie names the visitor and the session, so the error lands in
 * the same session as everything else they did.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  // posthog-node needs Node; the edge runtime (middleware) is left out.
  if (!key || process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { captureServerError } = await import("@/lib/analytics/server");
    await captureServerError(key, error, request, context);
  } catch {
    // Reporting an error must never be what breaks the response.
  }
};
