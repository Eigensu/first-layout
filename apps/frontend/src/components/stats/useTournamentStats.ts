import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/api/client";
import {
  publicCricHeroesApi,
  type BattingRow,
  type BowlingRow,
  type CachedTable,
  type MvpRow,
  type PointTableRow,
} from "@/lib/api/public/cricheroes";

export type Loadable<Row> =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; table: CachedTable<Row> };

export interface TournamentStats {
  pointTable: Loadable<PointTableRow>;
  mvp: Loadable<MvpRow>;
  batting: Loadable<BattingRow>;
  bowling: Loadable<BowlingRow>;
}

const LOADING: TournamentStats = {
  pointTable: { state: "loading" },
  mvp: { state: "loading" },
  batting: { state: "loading" },
  bowling: { state: "loading" },
};

function settle<Row>(result: PromiseSettledResult<CachedTable<Row>>): Loadable<Row> {
  return result.status === "fulfilled"
    ? { state: "ready", table: result.value }
    : { state: "error", message: getErrorMessage(result.reason) };
}

async function fetchStats(): Promise<TournamentStats> {
  const [pointTable, mvp, batting, bowling] = await Promise.allSettled([
    publicCricHeroesApi.pointTable(),
    publicCricHeroesApi.mvp(),
    publicCricHeroesApi.battingLeaderboard(),
    publicCricHeroesApi.bowlingLeaderboard(),
  ]);
  return {
    pointTable: settle(pointTable),
    mvp: settle(mvp),
    batting: settle(batting),
    bowling: settle(bowling),
  };
}

/**
 * The tournament's four CricHeroes tables, loaded together. Each is a cheap
 * read of the backend's cache, never a call to CricHeroes, so loading all
 * four up front costs nothing and makes switching tabs instant.
 */
export function useTournamentStats() {
  const [stats, setStats] = useState<TournamentStats>(LOADING);

  useEffect(() => {
    let current = true;
    fetchStats().then((loaded) => {
      if (current) setStats(loaded);
    });
    return () => {
      current = false;
    };
  }, []);

  const reload = useCallback(() => {
    setStats(LOADING);
    fetchStats().then(setStats);
  }, []);

  return { stats, reload };
}
