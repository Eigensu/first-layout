import { NEXT_PUBLIC_API_URL } from "@/config/env";

export type ApiPlayer = {
  id: string;
  name: string;
  team?: string;
  price: number;
  slot: string | null; // Slot ObjectId
  points?: number;
  image_url?: string | null;
};

export async function fetchPlayersBySlot(slotId: string, contestId?: string): Promise<ApiPlayer[]> {
  const q = new URLSearchParams();
  q.set("slot", String(slotId));
  q.set("limit", "1000");
  if (contestId) q.set("contest_id", String(contestId));
  const res = await fetch(`${NEXT_PUBLIC_API_URL}/api/players?${q.toString()}`);
  if (!res.ok) throw new Error(`Failed to load players for slot ${slotId} (${res.status})`);
  return (await res.json()) as ApiPlayer[];
}

// Hot Players API
export type ApiPlayerHotItem = {
  player: ApiPlayer;
  selection_count: number;
  is_hot: boolean;
};

export async function fetchHotPlayers(params?: {
  contest_id?: string;
  threshold?: number;
  limit?: number;
  skip?: number;
  sort?: "count_desc" | "name_asc";
}): Promise<ApiPlayerHotItem[]> {
  const q = new URLSearchParams();
  if (params?.contest_id) q.set("contest_id", String(params.contest_id));
  if (typeof params?.threshold === "number") q.set("threshold", String(params.threshold));
  if (typeof params?.limit === "number") q.set("limit", String(params.limit));
  if (typeof params?.skip === "number") q.set("skip", String(params.skip));
  if (params?.sort) q.set("sort", params.sort);
  const res = await fetch(`${NEXT_PUBLIC_API_URL}/api/players/hot?${q.toString()}`);
  if (!res.ok) throw new Error(`Failed to load hot players (${res.status})`);
  return (await res.json()) as ApiPlayerHotItem[];
}

export async function fetchHotPlayerIds(params?: {
  contest_id?: string;
  threshold?: number;
  limit?: number;
  skip?: number;
}): Promise<{ player_ids: string[]; threshold: number }> {
  const q = new URLSearchParams();
  if (params?.contest_id) q.set("contest_id", String(params.contest_id));
  if (typeof params?.threshold === "number") q.set("threshold", String(params.threshold));
  if (typeof params?.limit === "number") q.set("limit", String(params.limit));
  if (typeof params?.skip === "number") q.set("skip", String(params.skip));
  const res = await fetch(`${NEXT_PUBLIC_API_URL}/api/players/hot/ids?${q.toString()}`);
  if (!res.ok) throw new Error(`Failed to load hot player ids (${res.status})`);
  return (await res.json()) as { player_ids: string[]; threshold: number };
}

export async function fetchPlayerHot(
  playerId: string,
  params?: { contest_id?: string; threshold?: number }
): Promise<{
  player_id: string;
  selection_count_global: number;
  is_hot_global: boolean;
  selection_count_contest?: number;
  is_hot_contest?: boolean;
}> {
  const q = new URLSearchParams();
  if (params?.contest_id) q.set("contest_id", String(params.contest_id));
  if (typeof params?.threshold === "number") q.set("threshold", String(params.threshold));
  const res = await fetch(`${NEXT_PUBLIC_API_URL}/api/players/${playerId}/hot?${q.toString()}`);
  if (!res.ok) throw new Error(`Failed to load hot status for player ${playerId} (${res.status})`);
  return (await res.json()) as any;
}
