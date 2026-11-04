"use client";

import { Smartphone } from "lucide-react";
import { APP_STORE_URL } from "@/common/consts";
import LogoLoop, { type LogoItem } from "@/components/ui/LogoLoop";

const MESSAGES = [
  "For an elevated experience, download our app",
  "Walle Arena is on the App Store",
];

// At module scope because LogoLoop re-measures whenever this array changes.
const ITEMS: LogoItem[] = MESSAGES.map((message) => ({
  href: APP_STORE_URL,
  ariaLabel: `${message} (opens the App Store)`,
  node: (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-text-main">
      <Smartphone className="h-4 w-4 text-accent-pink-500" aria-hidden="true" />
      {message}
    </span>
  ),
}));

/** A scrolling strip across the top of both footers; it pauses on hover. */
export function AppDownloadTicker() {
  return (
    <LogoLoop
      logos={ITEMS}
      speed={50}
      gap={48}
      logoHeight={16}
      pauseOnHover
      fadeOut
      fadeOutColor="var(--bg-card)"
      ariaLabel="Download the Walle Arena app"
      className="bg-bg-card border-b border-border-subtle py-2.5"
    />
  );
}
