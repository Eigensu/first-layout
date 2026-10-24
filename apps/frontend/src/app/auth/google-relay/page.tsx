"use client";

import { useSearchParams } from "next/navigation";
import { GoogleRelay } from "@/components/auth/GoogleRelay";

// Opened in a popup on the apex by a tournament subdomain's Google button
// (src/lib/auth/googleRelay.ts); anywhere else it shows only a notice.
export default function GoogleRelayPage() {
  const params = useSearchParams();
  return <GoogleRelay origin={params.get("origin")} state={params.get("state")} />;
}
