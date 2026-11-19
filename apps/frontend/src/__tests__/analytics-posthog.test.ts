// @vitest-environment happy-dom
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  __loaded: false,
  register: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: posthog }));

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://walle-api.wallearena.com");
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return import("@/lib/analytics/posthog");
}

beforeEach(() => {
  vi.clearAllMocks();
  posthog.__loaded = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("observabilityOptions", () => {
  it("links API calls to the session and redacts what is sent", async () => {
    const { observabilityOptions } = await load();
    const options = observabilityOptions();

    expect(options).toMatchObject({
      tracing_headers: ["walle-api.wallearena.com"],
      session_recording: { maskAllInputs: true, maskTextSelector: "*" },
    });
    expect(options.session_recording?.maskTextFn?.("Call 9876543210, Rahul")).toBe("Call [mobile], Rahul");
    const beforeSend = options.before_send as (event: unknown) => { properties: Record<string, string> };
    expect(beforeSend({ properties: { $current_url: "https://x.com/reset?token=t" } }).properties.$current_url).toBe(
      "https://x.com/reset?token=[redacted]"
    );
  });
});

describe("registerTournament", () => {
  it("tags events with the subdomain's tournament", async () => {
    window.location.href = "https://rspl.wallearena.com/teams";
    const { registerTournament } = await load();
    registerTournament();
    expect(posthog.register).toHaveBeenCalledWith({ tournament: "rspl" });
  });

  it("leaves the apex domain untagged", async () => {
    window.location.href = "https://wallearena.com/";
    const { registerTournament } = await load();
    registerTournament();
    expect(posthog.register).not.toHaveBeenCalled();
  });
});

describe("reportApiError", () => {
  function apiError(status: number | undefined, code?: string) {
    const config = {
      method: "post",
      url: "/api/contests/6650f1c2a9b8e7d6c5b4a391/enroll",
      baseURL: "https://walle-api.wallearena.com",
      headers: new AxiosHeaders(),
    };
    const response = status === undefined ? undefined : { status, statusText: "", data: {}, headers: {}, config };
    return new AxiosError("Request failed", code, config, undefined, response);
  }

  async function started() {
    const analytics = await load();
    posthog.__loaded = true;
    return analytics;
  }

  it("does nothing before PostHog has started", async () => {
    const analytics = await load();
    analytics.reportApiError(apiError(502, AxiosError.ERR_BAD_RESPONSE));
    expect(posthog.captureException).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("files a server error under Error Tracking, by endpoint", async () => {
    const analytics = await started();
    analytics.reportApiError(apiError(502, AxiosError.ERR_BAD_RESPONSE));
    const [failure, properties] = posthog.captureException.mock.calls[0];
    expect(failure.name).toBe("ApiError");
    expect(failure.message).toBe("API 502: POST /api/contests/:id/enroll");
    expect(properties).toEqual({
      api_route: "/api/contests/:id/enroll",
      api_method: "POST",
      api_status: 502,
      api_error_code: "ERR_BAD_RESPONSE",
    });
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("files no answer at all as an error too", async () => {
    const analytics = await started();
    analytics.reportApiError(apiError(undefined, AxiosError.ECONNABORTED));
    expect(posthog.captureException.mock.calls[0][0].message).toBe(
      "API unreachable (ECONNABORTED): POST /api/contests/:id/enroll"
    );
  });

  it("counts a refusal as an event, not an error", async () => {
    const analytics = await started();
    analytics.reportApiError(apiError(422, AxiosError.ERR_BAD_REQUEST));
    expect(posthog.capture).toHaveBeenCalledWith("api_request_failed", {
      api_route: "/api/contests/:id/enroll",
      api_method: "POST",
      api_status: 422,
      api_error_code: "ERR_BAD_REQUEST",
    });
    expect(posthog.captureException).not.toHaveBeenCalled();
  });

  it("ignores a request the app cancelled", async () => {
    const analytics = await started();
    analytics.reportApiError(apiError(undefined, AxiosError.ERR_CANCELED));
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.captureException).not.toHaveBeenCalled();
  });
});

describe("apiRoute", () => {
  it.each([
    ["/api/teams/6650f1c2a9b8e7d6c5b4a391", undefined, "/api/teams/:id"],
    ["https://api.example.com/api/players/42?page=2", undefined, "/api/players/:id"],
    ["/api/leaderboard?contest=1", "https://api.example.com", "/api/leaderboard"],
    ["/api/admin/contests/6650f1c2a9b8e7d6c5b4a391/slots/3", undefined, "/api/admin/contests/:id/slots/:id"],
    [undefined, undefined, "unknown"],
  ])("%s -> %s", async (url, baseURL, route) => {
    const { apiRoute } = await load();
    expect(apiRoute(url, baseURL)).toBe(route);
  });
});
