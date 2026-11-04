import { useState } from "react";
import { API_BASE_URL, AUTH, LS_KEYS, tenantHeaders } from "@/common/consts";

// The backend's RosterImportResponse (app/schemas/admin/cricheroes_import.py).
export interface RosterImportPlayer {
  cricheroes_player_id: number;
  name: string;
  team: string;
  action: "create" | "link" | "linked" | "skip";
  reason?: string | null;
  player_id?: string | null;
  player_name?: string | null;
  player_team?: string | null;
}

export interface RosterImportResponse {
  dry_run: boolean;
  cricheroes_tournament_id: number;
  matches_listed: number;
  upcoming_matches: number;
  matches_read: number;
  matches_without_squad: number;
  cricheroes_calls: number;
  // True when an import used the roster its preview read.
  reused_preview: boolean;
  teams: string[];
  created: number;
  linked: number;
  already_linked: number;
  skipped: number;
  players: RosterImportPlayer[];
}

/**
 * The tournament id from what the admin typed: the id itself, or a CricHeroes
 * tournament link, which carries it as `/tournament/<id>/...`.
 */
export function parseCricHeroesTournamentId(input: string): number | null {
  const text = input.trim();
  const match = /^\d+$/.test(text)
    ? [text, text]
    : text.match(/\/tournament\/(\d+)/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function useCricHeroesImport() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RosterImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tournamentId = parseCricHeroesTournamentId(input);

  const updateInput = (value: string) => {
    setInput(value);
    setResult(null);
    setError(null);
  };

  // The import always targets the tournament the preview was for, never
  // whatever is typed in the box by then.
  const run = async (id: number | null, dryRun: boolean) => {
    if (id === null) {
      setError("Enter the CricHeroes tournament ID, or paste its link");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem(LS_KEYS.ACCESS_TOKEN) || "";
      const response = await fetch(
        `${API_BASE_URL}/api/admin/cricheroes/tournaments/${id}/import-players?dry_run=${dryRun}`,
        {
          method: "POST",
          headers: {
            [AUTH.HEADER]: `${AUTH.BEARER_PREFIX}${token}`,
            ...tenantHeaders(),
          },
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = typeof data?.detail === "string" ? data.detail : null;
        throw new Error(
          detail || `CricHeroes import failed (HTTP ${response.status})`,
        );
      }
      setResult(data as RosterImportResponse);
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "CricHeroes import failed",
      );
    } finally {
      setLoading(false);
    }
  };

  return {
    input,
    updateInput,
    tournamentId,
    loading,
    result,
    error,
    preview: () => run(tournamentId, true),
    confirm: () => run(result?.cricheroes_tournament_id ?? null, false),
  };
}
