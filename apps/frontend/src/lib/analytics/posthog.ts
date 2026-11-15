/**
 * PostHog in the browser: errors, pageviews and clicks, session replay, and
 * the headers that tie API calls to the session (docs/POSTHOG_OBSERVABILITY.md).
 *
 * Everything here is a no-op until NEXT_PUBLIC_POSTHOG_KEY is set.
 */
import type { AxiosError } from "axios";
import posthog from "posthog-js";

import { currentTournamentSlug } from "@/common/consts/tournament";
import { API_BASE_URL } from "@/config/constants";
import type { User } from "@/types/auth";

import { redactEvent, redactNetworkRequest, redactPersonalData } from "./redact";

export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
export const POSTHOG_HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").replace(
  /\/$/,
  ""
);
const SESSION_REPLAY = process.env.NEXT_PUBLIC_POSTHOG_SESSION_REPLAY !== "false";

/** Where PostHog's own links (the toolbar, "view in PostHog") should point. */
export function uiHost(host: string): string {
  return host.replace(/^https:\/\/(us|eu)\.i\.posthog\.com$/, "https://$1.posthog.com");
}

function apiHostname(): string | null {
  try {
    return new URL(API_BASE_URL).hostname;
  } catch {
    return null;
  }
}

function enabled(): boolean {
  return Boolean(POSTHOG_KEY) && typeof window !== "undefined" && posthog.__loaded;
}

/** Start PostHog; called once, from instrumentation-client.ts. */
export function initPostHog(): void {
  if (!POSTHOG_KEY || typeof window === "undefined" || posthog.__loaded) return;
  const api = apiHostname();
  posthog.init(POSTHOG_KEY, {
    // Proxied through this site (next.config.js), so ad blockers that block
    // PostHog's own domain do not cost us the errors of everyone using one.
    api_host: "/ingest",
    ui_host: uiHost(POSTHOG_HOST),
    defaults: "2026-08-30",
    person_profiles: "identified_only",
    capture_exceptions: true,
    // X-POSTHOG-SESSION-ID and -DISTINCT-ID on every API call, so the
    // backend files its errors and logs under this session.
    tracing_headers: api ? [api] : [],
    disable_session_recording: !SESSION_REPLAY,
    session_recording: {
      maskAllInputs: true,
      // Every text node goes through maskTextFn, which hides email addresses
      // and mobile numbers and leaves the rest readable.
      maskTextSelector: "*",
      maskTextFn: (text) => redactPersonalData(text),
      maskCapturedNetworkRequestFn: (request) => redactNetworkRequest(request),
    },
    before_send: (event) => redactEvent(event),
  });
  const tournament = currentTournamentSlug();
  if (tournament) posthog.register({ tournament });
}

/**
 * Attribute this browser's events to the signed-in user, by id alone. The
 * backend identifies requests by the same id.
 */
export function identifyUser(user: User): void {
  if (!enabled()) return;
  posthog.identify(user.id, {
    is_admin: user.is_admin,
    is_platform_admin: Boolean(user.is_platform_admin),
  });
}

/** On sign-out: the next person on this browser is someone new. */
export function resetUser(): void {
  if (!enabled()) return;
  posthog.reset();
}

/** An error React or the app caught and handled itself. */
export function captureError(error: unknown, properties?: Record<string, unknown>): void {
  if (!enabled()) return;
  posthog.captureException(error, properties);
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
