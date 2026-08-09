// Tournament subdomain constants and helpers.
// Slug rules are mirrored in the backend at app/common/consts/index.py — keep in sync.

// Root domain that carries tournament subdomains (<slug>.ROOT_DOMAIN).
export const ROOT_DOMAIN = (
  process.env.NEXT_PUBLIC_ROOT_DOMAIN || "wallearena.com"
).toLowerCase();

// 3-32 chars, lowercase alphanumerics + hyphens, alphanumeric at both ends.
export const TOURNAMENT_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

// Subdomains that can never become tournaments (infrastructure hostnames).
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "cdn",
  "staging",
  "dev",
  "test",
  "docs",
  "status",
  "assets",
  "static",
  "blog",
  "help",
  "support",
  "portal",
  "smtp",
  "imap",
  "ftp",
]);

export type TournamentStatus = "draft" | "live" | "completed" | "archived";

export const TOURNAMENT_STATUSES: TournamentStatus[] = [
  "draft",
  "live",
  "completed",
  "archived",
];

/** Derive a slug suggestion from a tournament name ("Summer Cup 2026" -> "summer-cup-2026"). */
export function slugifyTournamentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
}

/** Returns an error message for an invalid slug, or null when it is acceptable. */
export function getSlugError(slug: string): string | null {
  const value = slug.trim().toLowerCase();
  if (!TOURNAMENT_SLUG_REGEX.test(value)) {
    return "Use 3-32 lowercase letters, numbers or hyphens; start and end with a letter or number.";
  }
  if (RESERVED_SUBDOMAINS.has(value)) {
    return `"${value}" is a reserved subdomain.`;
  }
  if (value.startsWith("api-") || value.endsWith("-api")) {
    return 'Slugs starting with "api-" or ending with "-api" are reserved for backend hosts.';
  }
  return null;
}

/** Public URL for a tournament, e.g. https://dpcl.wallearena.com */
export function tournamentUrl(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`;
}

/**
 * Extract the tournament slug from a request host, or null when the host is
 * not a tournament subdomain. Safe against:
 *  - the apex + www (wallearena.com, www.wallearena.com)
 *  - reserved/infrastructure subdomains (api.*, admin.*, api-lpcl.*, ...)
 *  - nested labels (a.b.wallearena.com)
 *  - unrelated hosts (Vercel previews *.vercel.app, localhost, IPs)
 *  - local development via <slug>.localhost:3000
 */
export function getTournamentSlugFromHost(rawHost: string | null): string | null {
  if (!rawHost) return null;
  const host = rawHost.split(":")[0].toLowerCase();

  let label: string | null = null;
  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    label = host.slice(0, -(ROOT_DOMAIN.length + 1));
  } else if (host.endsWith(".localhost")) {
    label = host.slice(0, -".localhost".length);
  } else {
    return null;
  }

  if (!label || label.includes(".")) return null;
  if (RESERVED_SUBDOMAINS.has(label)) return null;
  if (label.startsWith("api-") || label.endsWith("-api")) return null;
  if (!TOURNAMENT_SLUG_REGEX.test(label)) return null;
  return label;
}
