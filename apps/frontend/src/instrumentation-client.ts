// Runs in the browser before the app hydrates (Next.js instrumentation-client),
// so errors thrown while the app starts are captured too.
import { initPostHog } from "@/lib/analytics/posthog";

initPostHog();
