"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BarChart3, Clock, RefreshCw } from "lucide-react";
import type { CachedTable } from "@/lib/api/public/cricheroes";
import { BattingTable, BowlingTable, MvpTable, PointsTable } from "./StatsTables";
import type { Loadable, TournamentStats } from "./useTournamentStats";

const TABS = [
  { id: "points", label: "Points Table" },
  { id: "mvp", label: "MVP" },
  { id: "batting", label: "Batting" },
  { id: "bowling", label: "Bowling" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const IST_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "5 Nov, 3:30 pm IST · 2 hours ago" */
function describeFetchedAt(iso: string, now = Date.now()): string {
  const at = new Date(iso);
  const minutes = Math.round((at.getTime() - now) / 60000);
  const ago =
    Math.abs(minutes) < 60
      ? RELATIVE.format(minutes, "minute")
      : Math.abs(minutes) < 60 * 48
        ? RELATIVE.format(Math.round(minutes / 60), "hour")
        : RELATIVE.format(Math.round(minutes / (60 * 24)), "day");
  return `${IST_TIME.format(at)} IST · ${ago}`;
}

function Notice({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card px-6 py-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-pink-tonal text-accent-pink-500">
        <BarChart3 className="h-7 w-7" />
      </div>
      <p className="text-lg font-semibold text-text-main">{title}</p>
      {children && (
        <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">{children}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function Panel<Row>({
  what,
  loadable,
  onRetry,
  render,
}: {
  what: string;
  loadable: Loadable<Row>;
  onRetry: () => void;
  render: (rows: Row[]) => ReactNode;
}) {
  if (loadable.state === "loading") {
    return (
      <div className="space-y-2" aria-busy="true" aria-label={`Loading the ${what}`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-bg-card" />
        ))}
      </div>
    );
  }
  if (loadable.state === "error") {
    return (
      <Notice
        title={`Couldn't load the ${what}`}
        action={
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-full bg-accent-pink-tonal px-4 py-2 text-sm font-semibold text-text-main transition-colors hover:bg-accent-pink-tonal-hover"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        }
      >
        {loadable.message}
      </Notice>
    );
  }
  const table: CachedTable<Row> = loadable.table;
  if (!table.fetched_at) {
    return (
      <Notice title="No stats yet">
        They appear here once CricHeroes has been read for this tournament,
        within an hour or so of setting it up.
      </Notice>
    );
  }
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs text-text-muted">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Last updated{" "}
          <time dateTime={table.fetched_at}>{describeFetchedAt(table.fetched_at)}</time>
        </span>
      </p>
      {table.rows.length === 0 ? (
        <Notice title={`The ${what} is empty`}>
          Nothing has been recorded for this tournament yet.
        </Notice>
      ) : (
        render(table.rows)
      )}
    </div>
  );
}

export function StatsView({
  stats,
  onRetry,
  hasTournament,
}: {
  stats: TournamentStats;
  onRetry: () => void;
  /** False off a tournament's own subdomain, where there is no tournament. */
  hasTournament: boolean;
}) {
  const [tab, setTab] = useState<TabId>("points");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const tables = [stats.pointTable, stats.mvp, stats.batting, stats.bowling];
  // Every table answers for the same tournament, so any one that loaded says
  // whether it is linked to CricHeroes at all.
  const loaded = tables.find((t) => t.state === "ready");
  const unlinked = loaded?.state === "ready" && !loaded.table.linked;

  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + step + TABS.length) % TABS.length];
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-12">
      <header className="mb-6 text-center">
        <div className="flex items-center justify-center gap-3">
          <BarChart3 className="h-7 w-7 text-accent-pink-500" aria-hidden />
          <h1 className="text-3xl font-extrabold text-text-main">Tournament Stats</h1>
        </div>
      </header>

      {!hasTournament ? (
        <Notice title="Pick a tournament">
          Stats belong to a tournament. Open one from the list of tournaments to
          see its points table and leaderboards.
        </Notice>
      ) : unlinked ? (
        <Notice title="No stats for this tournament">
          This tournament isn&apos;t linked to CricHeroes, so there is no points
          table or leaderboard to show.
        </Notice>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Stats"
            onKeyDown={onTabKey}
            className="mb-5 flex gap-1 overflow-x-auto rounded-full border border-border-subtle bg-bg-elevated p-1"
          >
            {TABS.map((t) => {
              const selected = t.id === tab;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  id={`stats-tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`stats-panel-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
                    selected
                      ? "bg-accent-pink-500 text-bg-body"
                      : "text-text-muted hover:bg-bg-card hover:text-text-main"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <section
            id={`stats-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`stats-tab-${tab}`}
          >
            {tab === "points" && (
              <Panel
                what="points table"
                loadable={stats.pointTable}
                onRetry={onRetry}
                render={(rows) => <PointsTable rows={rows} />}
              />
            )}
            {tab === "mvp" && (
              <Panel
                what="MVP table"
                loadable={stats.mvp}
                onRetry={onRetry}
                render={(rows) => <MvpTable rows={rows} />}
              />
            )}
            {tab === "batting" && (
              <Panel
                what="batting leaderboard"
                loadable={stats.batting}
                onRetry={onRetry}
                render={(rows) => <BattingTable rows={rows} />}
              />
            )}
            {tab === "bowling" && (
              <Panel
                what="bowling leaderboard"
                loadable={stats.bowling}
                onRetry={onRetry}
                render={(rows) => <BowlingTable rows={rows} />}
              />
            )}
          </section>

          {tab === "mvp" && (
            <p className="mt-3 text-xs text-text-muted">
              MVP points are CricHeroes&apos; own, not this game&apos;s fantasy points.
            </p>
          )}
        </>
      )}
    </main>
  );
}
