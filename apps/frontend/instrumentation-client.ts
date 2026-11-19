import posthog from "posthog-js"

import { observabilityOptions, registerTournament } from "@/lib/analytics/posthog"

const token = process.env.NEXT_PUBLIC_POSTHOG_KEY
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST

if (token && host) {
  posthog.init(token, {
    api_host: host,
    defaults: "2025-05-24",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
    logs: {
      serviceName: "fantasy11-frontend",
      environment: process.env.NODE_ENV ?? "development",
      serviceVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    },
    // Redaction, and the headers that tie API calls to this browser session
    // (docs/POSTHOG_OBSERVABILITY.md).
    ...observabilityOptions(),
  })
  registerTournament()
} else if (process.env.NODE_ENV === "development") {
  const missingVariable = !token
    ? "NEXT_PUBLIC_POSTHOG_KEY"
    : "NEXT_PUBLIC_POSTHOG_HOST"

  throw new Error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`
  )
}
