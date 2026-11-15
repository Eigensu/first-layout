// @vitest-environment happy-dom
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  __loaded: false,
  init: vi.fn(),
  register: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
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
  posthog.init.mockImplementation(() => {
    posthog.__loaded = true;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("initPostHog", () => {
  it("does nothing without a key", async () => {
    const analytics = await load({ NEXT_PUBLIC_POSTHOG_KEY: "" });
    analytics.initPostHog();
    analytics.identifyUser({ id: "u1" } as never);
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.identify).not.toHaveBeenCalled();
  });

  it("proxies through /ingest, links API calls and masks replays", async () => {
    const analytics = await load({
      NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
      NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
    });
    analytics.initPostHog();
    analytics.initPostHog();

    expect(posthog.init).toHaveBeenCalledTimes(1);
    const [key, config] = posthog.init.mock.calls[0];
    expect(key).toBe("phc_test");
    expect(config).toMatchObject({
      api_host: "/ingest",
      ui_host: "https://eu.posthog.com",
      capture_exceptions: true,
      person_profiles: "identified_only",
      tracing_headers: ["walle-api.wallearena.com"],
      disable_session_recording: false,
      session_recording: { maskAllInputs: true, maskTextSelector: "*" },
    });
    expect(config.session_recording.maskTextFn("Call 9876543210, Rahul")).toBe("Call [mobile], Rahul");
    expect(
      config.before_send({ properties: { $current_url: "https://x.com/reset?token=t" } }).properties.$current_url
    ).toBe("https://x.com/reset?token=[redacted]");
  });

  it("can leave session replay off", async () => {
    const analytics = await load({
      NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
      NEXT_PUBLIC_POSTHOG_SESSION_REPLAY: "false",
    });
    analytics.initPostHog();
    expect(posthog.init.mock.calls[0][1].disable_session_recording).toBe(true);
  });
});

describe("with PostHog started", () => {
  async function started() {
    const analytics = await load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test" });
    analytics.initPostHog();
    return analytics;
  }

  it("identifies a user by id and admin flags alone", async () => {
    const analytics = await started();
    analytics.identifyUser({
      id: "6650f1c2a9b8e7d6c5b4a391",
      username: "rahul",
      email: "rahul@example.com",
      full_name: "Rahul Sharma",
      mobile: "9876543210",
      is_admin: true,
      is_verified: true,
      is_active: true,
      created_at: "",
      avatar_url: null,
    });
    expect(posthog.identify).toHaveBeenCalledWith("6650f1c2a9b8e7d6c5b4a391", {
      is_admin: true,
      is_platform_admin: false,
    });
  });

  it("resets on sign-out", async () => {
    const analytics = await started();
    analytics.resetUser();
    expect(posthog.reset).toHaveBeenCalled();
  });

  function apiError(status: number | undefined, code?: string) {
    const config = {
      method: "post",
      url: "/api/contests/6650f1c2a9b8e7d6c5b4a391/enroll",
      baseURL: "https://walle-api.wallearena.com",
      headers: new AxiosHeaders(),
    };
    const response =
      status === undefined
        ? undefined
        : { status, statusText: "", data: {}, headers: {}, config };
    return new AxiosError("Request failed", code, config, undefined, response);
  }

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
