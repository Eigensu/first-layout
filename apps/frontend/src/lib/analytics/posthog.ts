/**
 * What the browser's PostHog needs beyond the setup in instrumentation-client.ts
 * (docs/POSTHOG_OBSERVABILITY.md): redaction, the headers that tie API calls to
 * the browser session, the tournament on every event, and failed API calls.
 *
 * posthog.init is called once, in instrumentation-client.ts; everything here
 * is a no-op until it has run.
 */
import type { AxiosError } from "axios";
import posthog, { type PostHogConfig } from "posthog-js";

import { currentTournamentSlug } from "@/common/consts/tournament";
import { API_BASE_URL } from "@/config/constants";

import { redactEvent, redactNetworkRequest, redactPersonalData } from "./redact";

function apiHostname(): string | null {
  try {
    return new URL(API_BASE_URL).hostname;
  } catch {
    return null;
  }
}

/**
 * posthog.init options for privacy and for linking API calls to this session.
 * instrumentation-client.ts spreads them into its init call.
 */
export function observabilityOptions(): Partial<PostHogConfig> {
  const api = apiHostname();
  return {
    // X-POSTHOG-SESSION-ID and -DISTINCT-ID on every API call, so the
    // backend files its errors and logs under this session.
    tracing_headers: api ? [api] : [],
    session_recording: {
      maskAllInputs: true,
      // Every text node goes through maskTextFn, which hides email addresses
      // and mobile numbers and leaves the rest readable.
      maskTextSelector: "*",
      maskTextFn: (text) => redactPersonalData(text),
      maskCapturedNetworkRequestFn: (request) => redactNetworkRequest(request),
    },
    before_send: (event) => redactEvent(event),
  };
}

/** Tag every event with the subdomain's tournament; after posthog.init. */
export function registerTournament(): void {
  const tournament = currentTournamentSlug();
  if (tournament) posthog.register({ tournament });
}

function enabled(): boolean {
  return typeof window !== "undefined" && Boolean(posthog.__loaded);
}

/**
 * `url` as a route: no origin or query, ids as `:id`. Errors group by
 * endpoint, not by which team or contest failed.
 */
export function apiRoute(url: string | undefined, baseURL?: string): string {
  if (!url) return "unknown";
  let path = url;
  try {
    path = new URL(url, baseURL || "http://relative").pathname;
  } catch {
    path = url.split("?")[0];
  }
  return path
    .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, "/:id");
}

/**
 * Report a failed API call. A server error, a timeout or no answer at all is
 * an exception, for Error Tracking; the backend's side of a 5xx arrives under
 * the same session. A 4xx is the API refusing something, which is normal
 * often enough to be an analytics event (`api_request_failed`) rather than an
 * issue. A request the app cancelled is neither.
 */
export function reportApiError(error: AxiosError): void {
  if (!enabled() || error.code === "ERR_CANCELED") return;
  const status = error.response?.status;
  const method = (error.config?.method || "get").toUpperCase();
  const route = apiRoute(error.config?.url, error.config?.baseURL);
  const properties = {
    api_route: route,
    api_method: method,
    api_status: status ?? null,
    api_error_code: error.code ?? null,
  };
  if (status !== undefined && status < 500) {
    posthog.capture("api_request_failed", properties);
    return;
  }
  const failure = new Error(
    status !== undefined
      ? `API ${status}: ${method} ${route}`
      : `API unreachable (${error.code || "network error"}): ${method} ${route}`
  );
  failure.name = "ApiError";
  posthog.captureException(failure, properties);
}
