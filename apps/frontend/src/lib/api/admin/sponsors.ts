import apiClient from "../client";
import { API } from "@/common/consts";
import type { Sponsor, SponsorTier } from "@/types/sponsor";

export interface SponsorCreateInput {
  name: string;
  logo: string;
  tier: SponsorTier;
  description: string;
  website?: string;
  featured?: boolean;
  active?: boolean;
  display_order?: number;
  priority?: number;
}

export async function createSponsor(
  input: SponsorCreateInput
): Promise<Sponsor> {
  // Build payload, omitting optional empty strings (e.g., website)
  const payload: Record<string, any> = {
    name: input.name,
    logo: input.logo,
    tier: input.tier,
    description: input.description,
    featured: input.featured,
    active: input.active,
    display_order: input.display_order,
    priority: input.priority,
  };
  if (typeof input.website === "string") {
    const raw = input.website.trim();
    if (raw.length > 0) {
      const normalized = /^(https?:)?\/\//i.test(raw) ? raw : `https://${raw}`;
      payload.website = normalized;
    }
  }

  const response = await apiClient.post(`${API.PREFIX}/v1/sponsors/`, payload, {
    headers: { "Content-Type": "application/json" },
  });
  const s = (response.data?.sponsor ?? response.data) as any;
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
}

export async function getAvailablePriorities(
  featured: boolean
): Promise<{ gaps: number[]; next: number; used: number[] }> {
  const response = await apiClient.get(
    `${API.PREFIX}/v1/sponsors/available-priorities`,
    { params: { featured } }
  );
  return response.data as { gaps: number[]; next: number; used: number[] };
}

export async function deleteSponsor(sponsorId: string): Promise<void> {
  // Item route defined without trailing slash
  await apiClient.delete(`${API.PREFIX}/v1/sponsors/${sponsorId}`);
}

export async function uploadSponsorLogo(
  sponsorId: string,
  file: File
): Promise<{ url: string; message: string }> {
  const form = new FormData();
  form.append("file", file);
  const response = await apiClient.post(
    `${API.PREFIX}/v1/sponsors/${sponsorId}/upload-logo`,
    form
  );
  return response.data;
}

export interface SponsorUpdateInput {
  name?: string;
  description?: string;
  logo?: string;
  website?: string;
  featured?: boolean;
  active?: boolean;
  tier?: SponsorTier;
  priority?: number;
}

export async function updateSponsor(
  sponsorId: string,
  input: SponsorUpdateInput
): Promise<Sponsor> {
  const payload: Record<string, any> = {};
  if (typeof input.name === "string") payload.name = input.name;
  if (typeof input.description === "string")
    payload.description = input.description;
  if (typeof input.logo === "string") payload.logo = input.logo;
  if (typeof input.website === "string") {
    const raw = input.website.trim();
    if (raw.length > 0) {
      payload.website = /^(https?:)?\/\//i.test(raw) ? raw : `https://${raw}`;
    }
  }
  if (typeof input.featured === "boolean") payload.featured = input.featured;
  if (typeof input.active === "boolean") payload.active = input.active;
  if (typeof input.tier === "string") payload.tier = input.tier;
  if (typeof input.priority === "number") payload.priority = input.priority;

  const response = await apiClient.put(
    `${API.PREFIX}/v1/sponsors/${sponsorId}`,
    payload,
    { headers: { "Content-Type": "application/json" } }
  );
  const s = (response.data?.sponsor ?? response.data) as any;
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
}
