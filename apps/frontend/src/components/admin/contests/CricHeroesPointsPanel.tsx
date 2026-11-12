import type { ContestCricHeroesPoints } from "@/lib/api/admin/contests";

/** Which CricHeroes matches count towards the contest, and who scores. */
export function CricHeroesPointsPanel({
  summary,
}: {
  summary: ContestCricHeroesPoints | null;
}) {
  if (!summary) {
    return (
      <div className="mt-4 text-sm text-text-muted">
        Couldn&apos;t load the CricHeroes points for this contest.
      </div>
    );
  }
  if (summary.cricheroes_tournament_id === null) {
    return (
      <div role="status" className="mt-4 text-sm text-warning">
        Points from CricHeroes is on, but this tournament isn&apos;t linked to a
        CricHeroes tournament, so nothing is being scored. A platform admin
        links it in Admin &gt; Tournaments.
      </div>
    );
  }
  const counted = summary.matches_counted;
  const awaiting = summary.matches_awaiting_mvp;
  return (
    <div className="mt-4 border border-border-subtle rounded p-3 bg-bg-elevated text-sm space-y-2">
      <div className="font-medium text-text-main">Points from CricHeroes</div>
      <div className="text-text-muted">
        {summary.players_scored} player
        {summary.players_scored === 1 ? "" : "s"} scored from {counted.length}{" "}
        match{counted.length === 1 ? "" : "es"}
        {awaiting.length > 0 &&
          `; ${awaiting.length} completed match${
            awaiting.length === 1 ? "" : "es"
          } still to read on the next hourly sync`}
        .
      </div>
      {counted.length > 0 && (
        <ul className="list-disc pl-5 text-text-main">
          {counted.map((m) => (
            <li key={m.match_id}>
              {m.teams}
              {m.match_date_time
                ? ` · ${formatMatchTime(m.match_date_time)}`
                : ""}
              <span className="text-text-muted"> · {m.players} players</span>
            </li>
          ))}
        </ul>
      )}
      {summary.unlinked_players.length > 0 && (
        <div className="text-warning">
          Not linked here, so scoring nothing:{" "}
          {summary.unlinked_players.join(", ")}. Link them with the CricHeroes
          import, or the CricHeroes ID column of the player sheet.
        </div>
      )}
    </div>
  );
}

function formatMatchTime(iso: string): string {
  const when = new Date(iso);
  return Number.isNaN(when.getTime())
    ? iso
    : when.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      });
}
