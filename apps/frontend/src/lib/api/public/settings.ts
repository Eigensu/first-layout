import { NEXT_PUBLIC_API_URL } from "@/config/env";

export type ApiGlobalSettings = {
  min_players_per_team: number;
  max_players_per_team: number;
  default_contest_logo_file_id?: string | null;
};

export async function fetchGlobalSettings(): Promise<ApiGlobalSettings> {
  const res = await fetch(`${NEXT_PUBLIC_API_URL}/api/settings`);
  if (!res.ok) throw new Error(`Failed to load global settings (${res.status})`);
  return res.json();
}
