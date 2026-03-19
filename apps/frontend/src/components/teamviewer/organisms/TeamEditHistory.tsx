"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  getTeamEditHistory,
  type TeamEditHistoryEntry,
} from "@/lib/api/teams";
import { LS_KEYS } from "@/common/consts";

interface TeamEditHistoryProps {
  teamId: string;
  /** Map of player IDs → names so we can resolve diffs */
  playerNameMap?: Record<string, string>;
}

/* ─── Helpers ─── */

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanLabel(field: string): string {
  switch (field) {
    case "team_name":
      return "Team Name";
    case "player_ids":
      return "Players";
    case "captain_id":
      return "Captain";
    case "vice_captain_id":
      return "Vice-Captain";
    default:
      return field.replace(/_/g, " ");
  }
}

function resolvePlayerName(
  id: unknown,
  map?: Record<string, string>
): string {
  if (!id || typeof id !== "string") return String(id ?? "—");
  return map?.[id] ?? id.slice(-6);
}

/* ─── Diff renderers ─── */

function PlayerListDiff({
  oldIds,
  newIds,
  map,
}: {
  oldIds: string[];
  newIds: string[];
  map?: Record<string, string>;
}) {
  const removed = oldIds.filter((id) => !newIds.includes(id));
  const added = newIds.filter((id) => !oldIds.includes(id));

  if (removed.length === 0 && added.length === 0) return <span>No change</span>;

  return (
    <div className="flex flex-col gap-1 text-xs">
      {removed.map((id) => (
        <span key={id} className="text-red-400 flex items-center gap-1">
          <span className="inline-block w-4 text-center font-bold">−</span>
          {resolvePlayerName(id, map)}
        </span>
      ))}
      {added.map((id) => (
        <span key={id} className="text-emerald-400 flex items-center gap-1">
          <span className="inline-block w-4 text-center font-bold">+</span>
          {resolvePlayerName(id, map)}
        </span>
      ))}
    </div>
  );
}

function FieldDiff({
  field,
  change,
  map,
}: {
  field: string;
  change: { old: unknown; new: unknown };
  map?: Record<string, string>;
}) {
  if (field === "player_ids") {
    return (
      <PlayerListDiff
        oldIds={(change.old as string[]) || []}
        newIds={(change.new as string[]) || []}
        map={map}
      />
    );
  }

  const oldLabel =
    field.endsWith("_id")
      ? resolvePlayerName(change.old, map)
      : String(change.old ?? "—");
  const newLabel =
    field.endsWith("_id")
      ? resolvePlayerName(change.new, map)
      : String(change.new ?? "—");

  return (
    <div className="text-xs flex items-center gap-1.5 flex-wrap">
      <span className="text-red-400 line-through">{oldLabel}</span>
      <span className="text-text-muted">→</span>
      <span className="text-emerald-400">{newLabel}</span>
    </div>
  );
}

/* ─── Main component ─── */

export function TeamEditHistory({ teamId, playerNameMap }: TeamEditHistoryProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<TeamEditHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const fetchHistory = useCallback(
    async (pg: number) => {
      const token = localStorage.getItem(LS_KEYS.ACCESS_TOKEN);
      if (!token) return;
      try {
        setLoading(true);
        setError(null);
        const data = await getTeamEditHistory(teamId, token, pg, PAGE_SIZE);
        setEntries(data.history);
        setTotal(data.total);
      } catch (e: any) {
        setError(e?.message || "Failed to load history");
      } finally {
        setLoading(false);
      }
    },
    [teamId]
  );

  // Fetch when opened
  useEffect(() => {
    if (open) fetchHistory(page);
  }, [open, page, fetchHistory]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const actionBadge = (action: string) => {
    if (action === "rename")
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-400">
          Rename
        </span>
      );
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-500/20 text-blue-400">
        Edit
      </span>
    );
  };

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-accent-pink-400 hover:text-accent-pink-300 transition-colors"
      >
        <svg
          className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Edit History
        {total > 0 && (
          <span className="text-xs text-text-muted">({total})</span>
        )}
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-border-subtle bg-bg-card/50 overflow-hidden">
          {loading && entries.length === 0 ? (
            <div className="p-4 text-center text-text-muted text-sm">
              Loading history…
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-400 text-sm">{error}</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-center text-text-muted text-sm">
              No edits recorded yet.
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border-subtle">
                {entries.map((entry) => (
                  <li key={entry.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {actionBadge(entry.action)}
                        <span className="text-xs text-text-muted">
                          by{" "}
                          <span className="text-text-main font-medium">
                            {entry.username || "Unknown"}
                          </span>
                        </span>
                      </div>
                      <span className="text-[11px] text-text-muted">
                        {formatDate(entry.edited_at)}
                      </span>
                    </div>

                    <div className="space-y-1.5 pl-1">
                      {Object.entries(entry.changes).map(([field, change]) => (
                        <div key={field} className="flex items-start gap-2">
                          <span className="text-xs text-text-muted w-24 shrink-0 pt-0.5">
                            {humanLabel(field)}
                          </span>
                          <FieldDiff
                            field={field}
                            change={change as { old: unknown; new: unknown }}
                            map={playerNameMap}
                          />
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 p-3 border-t border-border-subtle">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="text-xs px-2 py-1 rounded bg-bg-elevated text-text-muted hover:text-text-main disabled:opacity-40 transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-text-muted">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="text-xs px-2 py-1 rounded bg-bg-elevated text-text-muted hover:text-text-main disabled:opacity-40 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
