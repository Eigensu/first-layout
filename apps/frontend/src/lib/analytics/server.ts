/**
 * Server-side errors to PostHog, from instrumentation.ts's onRequestError.
 * Node only: posthog-node is imported nowhere the browser bundle reaches.
 */
import type { Instrumentation } from "next";
import { PostHog } from "posthog-node";

import { redactEvent, redactUrl } from "./redact";

type Request = Parameters<Instrumentation.onRequestError>[1];
type Context = Parameters<Instrumentation.onRequestError>[2];

let client: PostHog | null = null;

function posthogClient(key: string): PostHog {
  client ??= new PostHog(key, {
    // Straight to PostHog: the /ingest proxy is for browsers.
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    before_send: (event) => redactEvent(event),
  });
  return client;
}

/**
 * The visitor's PostHog ids from the cookie posthog-js keeps,
 * `ph_<project key>_posthog`: the distinct id, and the session id, second in
 * its `$sesid` triple.
 */
export function posthogIdsFromCookie(
  cookieHeader: string | string[] | undefined,
  key: string
): { distinctId?: string; sessionId?: string } {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  if (!header) return {};
  const prefix = `ph_${key}_posthog=`;
  const cookie = header.split(/;\s*/).find((c) => c.startsWith(prefix));
  if (!cookie) return {};
  try {
    const value = JSON.parse(decodeURIComponent(cookie.slice(prefix.length)));
    const distinctId = typeof value?.distinct_id === "string" ? value.distinct_id : undefined;
    const sessionId = Array.isArray(value?.$sesid) && typeof value.$sesid[1] === "string" ? value.$sesid[1] : undefined;
    return { distinctId, sessionId };
  } catch {
    return {};
  }
}

export async function captureServerError(
  key: string,
  error: unknown,
  request: Request,
  context: Context
): Promise<void> {
  const { distinctId, sessionId } = posthogIdsFromCookie(request.headers.cookie, key);
  const tournament = request.headers["x-tournament-slug"];
  // Immediate: a serverless function can be frozen before a batch would go.
  await posthogClient(key).captureExceptionImmediate(error, distinctId, {
    ...(sessionId ? { $session_id: sessionId } : {}),
    ...(typeof tournament === "string" ? { tournament } : {}),
    $current_url: redactUrl(request.path),
    $request_method: request.method,
    service: "frontend-server",
    next_route: context.routePath,
    next_route_type: context.routeType,
    next_router: context.routerKind,
  });
}
