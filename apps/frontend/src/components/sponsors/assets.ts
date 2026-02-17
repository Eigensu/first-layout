// Local assets mapping for sponsors. Keys can be name/id/slug. Values are public/ paths.
// Example provided by user: apps/frontend/public/world-tower-premier-league-season-2-sponsors/Auction Partner.png
// Use the public path starting with '/'. Spaces are supported by next/image.

export const sponsorLogoMap: Record<string, string> = {
  // Map by exact sponsor name as seen in UI/API
  CHADIYALI: "/world-tower-premier-league-season-2-sponsors/auction-partner.png",
  // Add more mappings here as needed
};

function normalizeKey(value?: string) {
  return (value || "").trim().toLowerCase();
}

// Build candidate local paths from description-based convention.
// Example: description "Auction Partner" => "/world-tower-premier-league-season-2-sponsors/auction-partner.png"
const DESCRIPTION_BASE_DIR = "/world-tower-premier-league-season-2-sponsors"; // under public/
const CANDIDATE_EXTS = [".png", ".webp", ".jpg", ".jpeg"]; // try common formats

function buildCandidatesFromDescription(desc?: string): string[] {
  if (!desc) return [];
  const original = desc.trim();
  if (!original) return [];

  const variants: string[] = [];
  const pushUnique = (v: string) => {
    if (!variants.includes(v)) variants.push(v);
  };
  // Original as-is
  pushUnique(original);
  // Title Case (basic)
  pushUnique(
    original
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
  // Kebab-case
  pushUnique(
    original
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );

  const candidates: string[] = [];
  for (const v of variants) {
    for (const ext of CANDIDATE_EXTS) {
      // Prefer the exact "Auction Partner.png" convention first
      candidates.push(`${DESCRIPTION_BASE_DIR}/${v}${ext}`);
    }
  }
  return candidates;
}

export function getSponsorLogo(input: {
  id?: string;
  name?: string;
  description?: string;
}): string | undefined {
  // Try exact by name (case-insensitive)
  const byName = sponsorLogoMap[input.name as keyof typeof sponsorLogoMap];
  if (byName) return byName;

  // Case-insensitive match
  const nameKey = normalizeKey(input.name);
  for (const key of Object.keys(sponsorLogoMap)) {
    if (normalizeKey(key) === nameKey) return sponsorLogoMap[key];
  }

  // Description-based convention: try building candidate paths from description
  const candidates = buildCandidatesFromDescription(input.description);
  if (candidates.length) {
    // We cannot check existence here; return the first candidate.
    // Next.js will serve from public/ if present. If not, backend logo will be used (fallback occurs in caller).
    return candidates[0];
  }

  return undefined;
}

// Optional per-sponsor theme overrides: 'dark' | 'light'
const sponsorThemeOverride: Record<string, "dark" | "light"> = {
  // Example:
  // CHADIYALI: "dark",
};

export function getSponsorTheme(input: {
  id?: string;
  name?: string;
  description?: string;
}): "dark" | "light" {
  // Name-based override (case-insensitive)
  const nameKey = Object.keys(sponsorThemeOverride).find(
    (k) => normalizeKey(k) === normalizeKey(input.name)
  );
  if (nameKey) return sponsorThemeOverride[nameKey];

  // Heuristic: if description mentions 'dark bg' explicitly
  const desc = normalizeKey(input.description);
  if (/(dark|dark bg|dark background)/.test(desc)) return "dark";

  // Default to light
  return "light";
}
