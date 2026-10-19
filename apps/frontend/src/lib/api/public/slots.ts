import { NEXT_PUBLIC_API_URL } from "@/config/env";
import { tenantHeaders } from "@/common/consts";

export type ApiSlot = {
  id: string;
  code: string;
  name: string;
  min_select: number;
  max_select: number;
};

export async function fetchSlots(): Promise<ApiSlot[]> {
  const res = await fetch(`${NEXT_PUBLIC_API_URL}/api/slots`, {
    headers: tenantHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to load slots (${res.status})`);
  const data = await res.json();
  return (data?.slots || []) as ApiSlot[];
}
