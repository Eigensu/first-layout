"use client";

import { Smartphone } from "lucide-react";
import { APP_STORE_URL } from "@/common/consts";
import LogoLoop, { type LogoItem } from "@/components/ui/LogoLoop";

const MESSAGES = [
  "For an elevated experience, download our app",
  "Wall-E Arena is on the App Store",
];

// At module scope because LogoLoop re-measures whenever this array changes.
const ITEMS: LogoItem[] = MESSAGES.map((message) => ({
  href: APP_STORE_URL,
  ariaLabel: `${message} (opens the App Store)`,
  node: <TickerMessage message={message} />,
}));

function TickerMessage({ message }: { message: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-text-main">
      <Smartphone
        className="h-4 w-4 flex-none text-accent-pink-500"
        aria-hidden="true"
      />
      {message}
    </span>
  );
}

/**
 * A scrolling strip across the top of both footers; it pauses on hover. With
 * reduced motion the row couldn't scroll to whatever overflows it, so those
 * visitors get every message as a static, wrapping list instead.
 */
export function AppDownloadTicker() {
  return (
    <div className="bg-bg-card border-b border-border-subtle">
      <div className="motion-reduce:hidden">
        <LogoLoop
          logos={ITEMS}
          speed={50}
          gap={48}
          logoHeight={16}
          pauseOnHover
          fadeOut
          fadeOutColor="var(--bg-card)"
          ariaLabel="Download the Wall-E Arena app"
          className="whitespace-nowrap py-2.5"
        />
      </div>
      <ul className="hidden motion-reduce:flex flex-wrap justify-center gap-x-8 gap-y-2 px-4 py-2.5">
        {MESSAGES.map((message) => (
          <li key={message}>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80"
            >
              <TickerMessage message={message} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
