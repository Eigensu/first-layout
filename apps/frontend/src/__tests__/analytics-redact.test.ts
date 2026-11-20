import { describe, expect, it } from "vitest";

import {
  redactEvent,
  redactNetworkRequest,
  redactPersonalData,
  redactUrl,
} from "@/lib/analytics/redact";

// A UUID whose last group is all digits: one in a few hundred session ids.
const DIGIT_ENDED_SESSION = "0199c5a1-7f3e-7a2b-9c4d-123456789012";

describe("redactPersonalData", () => {
  it.each([
    ['dup key { email: "A.b+c@mail.example.co.in" }', 'dup key { email: "[email]" }'],
    ["SMS to 9876543210 failed", "SMS to [mobile] failed"],
    ["SMS to +919876543210", "SMS to [mobile]"],
    ["9876543210", "[mobile]"],
    ["call 9876543210 or 9876543211.", "call [mobile] or [mobile]."],
    ["a@example.com", "[email]"],
    ["(a.b@example.com)", "([email])"],
    ["to=a@example.com,b@example.org", "to=[email],[email]"],
    ["a@b.c@d.com", "a@[email]"],
  ])("redacts %j", (text, redacted) => {
    expect(redactPersonalData(text)).toBe(redacted);
  });

  it("takes linear time on a long run with no @", () => {
    // A long display name, masked by session replay on every render. The old
    // pattern rescanned it from every position and froze the page.
    const text = "a".repeat(200_000);
    const started = performance.now();
    expect(redactPersonalData(text)).toBe(text);
    expect(redactPersonalData(`${text}@example`)).toBe(`${text}@example`);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it.each([
    "user 6650f1c2a9b8e7d6c5b4a391",
    "tournament 2242502, match 12345678",
    "session 0199c5a1-7f3e-7a2b-9c4d-0a1b2c3d4e5f",
    "Rahul Sharma joined",
  ])("leaves %j alone", (text) => {
    expect(redactPersonalData(text)).toBe(text);
  });
});

describe("redactUrl", () => {
  it("masks the password-reset token", () => {
    expect(redactUrl("https://rspl.wallearena.com/auth/forgot-password/reset?token=abc.def-123")).toBe(
      "https://rspl.wallearena.com/auth/forgot-password/reset?token=[redacted]"
    );
  });

  it("masks the refresh token the API client sends", () => {
    expect(redactUrl("https://api.example.com/api/auth/refresh?refresh_token=eyJ.x.y")).toBe(
      "https://api.example.com/api/auth/refresh?refresh_token=[redacted]"
    );
  });

  it("redacts the reset destination, encoded or not", () => {
    expect(redactUrl("/auth/forgot-password/verify?email=someone%40example.com")).toBe(
      "/auth/forgot-password/verify?email=[email]"
    );
    expect(redactUrl("/auth/forgot-password/verify?mobile=9876543210")).toBe(
      "/auth/forgot-password/verify?mobile=[mobile]"
    );
  });

  it("keeps everything else", () => {
    expect(redactUrl("https://x.wallearena.com/teams?contest=6650f1c2a9b8e7d6c5b4a391&tab=2#top")).toBe(
      "https://x.wallearena.com/teams?contest=6650f1c2a9b8e7d6c5b4a391&tab=2#top"
    );
    expect(redactUrl("https://x.wallearena.com/home")).toBe("https://x.wallearena.com/home");
  });
});

describe("redactEvent", () => {
  it("redacts URLs, text and exceptions, and leaves ids intact", () => {
    const event = {
      event: "$exception",
      properties: {
        distinct_id: "6650f1c2a9b8e7d6c5b4a391",
        $session_id: DIGIT_ENDED_SESSION,
        $current_url: "https://x.wallearena.com/auth/forgot-password/reset?token=secret",
        $el_text: "someone@example.com",
        $elements_chain: 'a:text="9876543210"nth-child="1"',
        $exception_list: [{ type: "Error", value: "no account for someone@example.com" }],
        $elements: [{ $el_text: "9876543210", attr__href: "/auth/forgot-password/verify?mobile=9876543210" }],
      },
      $set_once: { $initial_current_url: "https://x.wallearena.com/auth/forgot-password/reset?token=secret" },
    };

    const redacted = redactEvent(event);

    expect(redacted.properties.distinct_id).toBe("6650f1c2a9b8e7d6c5b4a391");
    expect(redacted.properties.$session_id).toBe(DIGIT_ENDED_SESSION);
    expect(redacted.properties.$current_url).toBe(
      "https://x.wallearena.com/auth/forgot-password/reset?token=[redacted]"
    );
    expect(redacted.properties.$el_text).toBe("[email]");
    expect(redacted.properties.$elements_chain).toBe('a:text="[mobile]"nth-child="1"');
    expect(redacted.properties.$exception_list[0].value).toBe("no account for [email]");
    expect(redacted.properties.$elements[0]).toEqual({
      $el_text: "[mobile]",
      attr__href: "/auth/forgot-password/verify?mobile=[mobile]",
    });
    expect(redacted.$set_once.$initial_current_url).toBe(
      "https://x.wallearena.com/auth/forgot-password/reset?token=[redacted]"
    );
  });

  it("passes a dropped event through", () => {
    expect(redactEvent(null)).toBeNull();
  });
});

it("redactNetworkRequest masks the URL replay records", () => {
  expect(
    redactNetworkRequest({ name: "https://api.example.com/api/auth/refresh?refresh_token=t", status: 200 })
  ).toEqual({ name: "https://api.example.com/api/auth/refresh?refresh_token=[redacted]", status: 200 });
});
