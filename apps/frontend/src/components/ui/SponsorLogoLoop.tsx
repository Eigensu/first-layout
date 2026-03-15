"use client";

import { useEffect, useState } from "react";
import LogoLoop, { type LogoLoopProps, type LogoItem } from "./LogoLoop";
import { getSponsors } from "@/lib/api/sponsors";
import type { Sponsor } from "@/types/sponsor";
import { API_V1_BASE } from "@/config/constants";

// Always shown regardless of API response
const PINNED_LOGOS: LogoItem[] = [
  { src: "/logos/company1.png", alt: "Walle Arena Partner" },
];

// Default fallback logos — used when the API returns no sponsors
const DEFAULT_FALLBACK_LOGOS: LogoItem[] = [
  { src: "/logos/company1.png", alt: "Walle Arena Partner" },
  { src: "/logos/c4.png", alt: "Sponsor" },
];

/**
 * A drop-in replacement for LogoLoop that automatically fetches active sponsors
 * from the backend and displays their logos in the scrolling loop.
 *
 * - `company1.png` is always prepended to the list.
 * - If the API returns no sponsors (or fails), falls back to `fallbackLogos`
 *   (defaults to all local logos in /logos/).
 * - All LogoLoop display props are forwarded as-is.
 */
interface SponsorLogoLoopProps extends Omit<LogoLoopProps, "logos"> {
  /** Shown when API returns nothing. Defaults to local /logos/ files. */
  fallbackLogos?: LogoItem[];
  /** Only show featured sponsors (default: false → show all active) */
  featuredOnly?: boolean;
}

function resolveLogoUrl(logo: string): string {
  if (!logo) return "";
  if (logo.startsWith("http://") || logo.startsWith("https://")) return logo;
  const base = API_V1_BASE.replace(/\/api\/v1\/?$/, "");
  return `${base}${logo.startsWith("/") ? "" : "/"}${logo}`;
}

export function SponsorLogoLoop({
  fallbackLogos = DEFAULT_FALLBACK_LOGOS,
  featuredOnly = false,
  ...logoLoopProps
}: SponsorLogoLoopProps) {
  const [apiLogos, setApiLogos] = useState<LogoItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sponsors: Sponsor[] = await getSponsors({
          active: true,
          featured: featuredOnly || undefined,
        });

        if (cancelled) return;

        const fetched: LogoItem[] = sponsors.map((s) => ({
          src: resolveLogoUrl(s.logo),
          alt: s.name,
          href: s.website || undefined,
          title: s.name,
        }));

        setApiLogos(fetched);
      } catch {
        if (!cancelled) setApiLogos([]); // signal: fetch done, no data
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredOnly]);

  // Still loading — don't render yet
  if (apiLogos === null) return null;

  // Merge: pinned + (API logos if any, else fallback)
  const sourceLogos = apiLogos.length > 0 ? apiLogos : fallbackLogos;

  // Deduplicate pinned: remove any API logo whose src matches a pinned logo
  const pinnedSrcs = new Set(PINNED_LOGOS.map((l) => ("src" in l ? l.src : "")));
  const filteredSource = sourceLogos.filter(
    (l) => !("src" in l) || !pinnedSrcs.has((l as any).src)
  );

  const logos: LogoItem[] = [...PINNED_LOGOS, ...filteredSource];

  if (logos.length === 0) return null;

  return <LogoLoop logos={logos} {...logoLoopProps} />;
}

export default SponsorLogoLoop;

