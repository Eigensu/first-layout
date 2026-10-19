import { API_V1_BASE } from "@/config/constants";
import { Sponsor, SponsorsResponse, SponsorFilters } from "@/types/sponsor";
import { buildApiUrl } from "@/common/utils/url";
import { tenantHeaders } from "@/common/consts";

/**
 * Fetch all sponsors with optional filters
 * This is prepared for backend integration
 */
export async function getSponsors(
  filters?: SponsorFilters
): Promise<Sponsor[]> {
  try {
    const url = buildApiUrl(
      API_V1_BASE,
      "/sponsors",
      {
        tier: filters?.tier && filters.tier !== "all" ? filters.tier : undefined,
        featured: filters?.featured,
        active: filters?.active,
      },
      { trailingSlash: true }
    );

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...tenantHeaders(),
      },
      // Add cache options as needed
      next: { revalidate: 3600 }, // Revalidate every hour
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sponsors: ${response.statusText}`);
    }

    const raw = await response.json();
    // Normalize potential snake_case keys and _id into our Sponsor type
    const data: SponsorsResponse = {
      sponsors: (raw.sponsors || []).map((s: any) => ({
        id: s.id ?? s._id,
        name: s.name,
        logo: s.logo,
        tier: s.tier,
        description: s.description,
        website: s.website,
        featured: s.featured,
        active: s.active,
        priority: s.priority,
        createdAt: s.createdAt ?? s.created_at,
        updatedAt: s.updatedAt ?? s.updated_at,
      })),
      total: raw.total ?? (raw.sponsors ? raw.sponsors.length : 0),
    } as SponsorsResponse;

    // Fallback sort by priority asc if backend didn't order (defensive)
    return data.sponsors.sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));
  } catch (error) {
    console.error("Error fetching sponsors:", error);
    throw error;
  }
}

/**
 * Fetch a single sponsor by ID
 */
export async function getSponsorById(id: string): Promise<Sponsor> {
  try {
    const response = await fetch(`${API_V1_BASE}/sponsors/${id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...tenantHeaders(),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sponsor: ${response.statusText}`);
    }

    const raw = await response.json();
    const s = raw.sponsor ?? raw;
    const sponsor: Sponsor = {
      id: s.id ?? s._id,
      name: s.name,
      logo: s.logo,
      tier: s.tier,
      description: s.description,
      website: s.website,
      featured: s.featured,
      active: s.active,
      priority: s.priority,
      createdAt: s.createdAt ?? s.created_at,
      updatedAt: s.updatedAt ?? s.updated_at,
    };
    return sponsor;
  } catch (error) {
    console.error("Error fetching sponsor:", error);
    throw error;
  }
}

/**
 * Fetch featured sponsors only
 */
export async function getFeaturedSponsors(): Promise<Sponsor[]> {
  return getSponsors({ featured: true, active: true });
}
