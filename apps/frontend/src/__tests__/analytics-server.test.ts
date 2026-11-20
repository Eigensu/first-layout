import { describe, expect, it, vi } from "vitest";

const captureExceptionImmediate = vi.hoisted(() => vi.fn());
const constructed = vi.hoisted(() => [] as unknown[][]);
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      constructed.push(args);
    }
    captureExceptionImmediate = captureExceptionImmediate;
  },
}));

import { captureServerError, posthogIdsFromCookie } from "@/lib/analytics/server";

const KEY = "phc_test";

function posthogCookie(value: object) {
  return `ph_${KEY}_posthog=${encodeURIComponent(JSON.stringify(value))}`;
}

describe("posthogIdsFromCookie", () => {
  it("reads the distinct and session ids posthog-js keeps", () => {
    const cookie = `theme=dark; ${posthogCookie({
      distinct_id: "6650f1c2a9b8e7d6c5b4a391",
      $sesid: [1763190000000, "0199c5a1-7f3e-7a2b-9c4d-123456789012", 1763180000000],
    })}; other=1`;
    expect(posthogIdsFromCookie(cookie, KEY)).toEqual({
      distinctId: "6650f1c2a9b8e7d6c5b4a391",
      sessionId: "0199c5a1-7f3e-7a2b-9c4d-123456789012",
    });
  });

  it.each([undefined, "", "theme=dark", `ph_${KEY}_posthog=not-json`, `ph_other_posthog=${encodeURIComponent("{}")}`])(
    "is empty for %j",
    (cookie) => {
      expect(posthogIdsFromCookie(cookie, KEY)).toEqual({});
    }
  );
});

it("captureServerError sends the error under the visitor's session", async () => {
  const error = new Error("render failed");
  await captureServerError(
    KEY,
    error,
    {
      path: "/auth/forgot-password/reset?token=secret",
      method: "GET",
      headers: {
        cookie: posthogCookie({ distinct_id: "anon-1", $sesid: [1, "session-1", 0] }),
        "x-tournament-slug": "rspl",
      },
    },
    {
      routerKind: "App Router",
      routePath: "/auth/forgot-password/reset",
      routeType: "render",
      revalidateReason: undefined,
    }
  );

  expect(captureExceptionImmediate).toHaveBeenCalledWith(error, "anon-1", {
    $session_id: "session-1",
    tournament: "rspl",
    $current_url: "/auth/forgot-password/reset?token=[redacted]",
    $request_method: "GET",
    service: "frontend-server",
    next_route: "/auth/forgot-password/reset",
    next_route_type: "render",
    next_router: "App Router",
  });
  // Redacted on the way out, like the browser's events.
  expect(constructed[0][1]).toHaveProperty("before_send");
});
