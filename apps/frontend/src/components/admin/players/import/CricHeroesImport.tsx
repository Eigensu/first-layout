"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { AlertCircle, CheckCircle2, Loader2, Search } from "lucide-react";
import {
  RosterImportPlayer,
  RosterImportResponse,
  useCricHeroesImport,
} from "./useCricHeroesImport";

interface CricHeroesImportProps {
  // Called when the admin closes the result of a real import.
  onDone?: () => void;
}

/**
 * Adds a CricHeroes tournament's players to this tournament. CricHeroes have
 * no player list per tournament, so the backend reads the playing squad of
 * every match played so far (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9.1).
 * Platform admins only: every search spends the shared yearly call allowance.
 */
export function CricHeroesImport({ onDone }: CricHeroesImportProps) {
  const {
    input,
    updateInput,
    tournamentId,
    loading,
    result,
    error,
    preview,
    confirm,
  } = useCricHeroesImport();

  const toWrite = result ? result.created + result.linked : 0;

  return (
    <Card>
      <CardBody>
        <h3 className="text-lg font-semibold text-text-main mb-2">
          Import from CricHeroes
        </h3>
        <p className="text-sm text-text-muted mb-4">
          Adds everyone named in a playing squad of the tournament&apos;s
          matches so far. Players already here with the same name are given
          their CricHeroes ID, and their prices, slots and points are not
          changed. New players start with a price of 0.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => updateInput(e.target.value)}
            // Locked while a search or import runs, so the result shown is
            // always for the id in the box.
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tournamentId !== null && !loading) {
                preview();
              }
            }}
            placeholder="CricHeroes tournament ID or link"
            aria-label="CricHeroes tournament ID or link"
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <Button
            variant="outline"
            onClick={preview}
            disabled={loading || tournamentId === null}
            className="bg-white hover:bg-gray-50"
          >
            {loading && !result ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Find players
          </Button>
        </div>
        <p className="text-xs text-text-muted mt-2">
          Each search uses 1 CricHeroes call plus 1 per match played, from the
          yearly allowance. Importing within 10 minutes of a search uses what it
          found, at no extra cost.
        </p>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {result && <RosterResult result={result} />}

        {result && (
          <div className="flex justify-end mt-4">
            {result.dry_run && toWrite > 0 && (
              <Button variant="primary" onClick={confirm} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                {importLabel(result)}
              </Button>
            )}
            {!result.dry_run && onDone && (
              <Button variant="primary" onClick={onDone}>
                Done
              </Button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function importLabel(result: RosterImportResponse): string {
  const parts = [];
  if (result.created) parts.push(`add ${result.created}`);
  if (result.linked) parts.push(`link ${result.linked}`);
  const text = parts.join(" and ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} player${
    result.created + result.linked === 1 ? "" : "s"
  }`;
}

function RosterResult({ result }: { result: RosterImportResponse }) {
  const planned = result.dry_run;
  const tiles = [
    {
      label: planned ? "Will add" : "Added",
      value: result.created,
      tone: "green",
    },
    {
      label: planned ? "Will link" : "Linked",
      value: result.linked,
      tone: "blue",
    },
    { label: "Already linked", value: result.already_linked, tone: "gray" },
    { label: "Skipped", value: result.skipped, tone: "amber" },
  ] as const;
  const toneClasses = {
    green: "bg-green-50 border-green-100 text-green-700",
    blue: "bg-blue-50 border-blue-100 text-blue-700",
    gray: "bg-gray-50 border-gray-200 text-gray-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
  };

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-text-main">
        Read the squads of {result.matches_read} of {result.matches_listed}{" "}
        matches
        {result.upcoming_matches > 0 &&
          `, ${result.upcoming_matches} not played yet`}
        {result.matches_without_squad > 0 &&
          `, ${result.matches_without_squad} with no squad on CricHeroes`}
        . Found {result.players.length} players in {result.teams.length} teams
        {result.reused_preview
          ? ", from the preview: no new CricHeroes calls."
          : `, using ${result.cricheroes_calls} CricHeroes calls.`}
      </p>

      {result.players.length === 0 ? (
        <p className="text-sm text-text-muted">{noPlayersReason(result)}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tiles.map((tile) => (
              <div
                key={tile.label}
                className={`rounded-lg p-3 border ${toneClasses[tile.tone]}`}
              >
                <p className="text-sm font-medium">{tile.label}</p>
                <p className="text-2xl font-bold">{tile.value}</p>
              </div>
            ))}
          </div>

          <div className="max-h-80 overflow-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">
                    Team
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">
                    CricHeroes ID
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">
                    {planned ? "Action" : "Result"}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {result.players.map((player) => (
                  <tr key={player.cricheroes_player_id}>
                    <td className="px-3 py-2 text-gray-900">{player.name}</td>
                    <td className="px-3 py-2 text-gray-700">{player.team}</td>
                    <td className="px-3 py-2 text-gray-500 tabular-nums">
                      {player.cricheroes_player_id}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {describe(player, planned)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Why a search found nobody. Matches that were played but have no squad on
// CricHeroes are not the same as a tournament that has not started.
function noPlayersReason(result: RosterImportResponse): string {
  const missing = result.matches_without_squad;
  if (missing > 0) {
    const which =
      missing === 1 ? "the 1 match" : `any of the ${missing} matches`;
    return (
      `No players found: CricHeroes have no playing squad for ${which} ` +
      "played so far. Check the matches on CricHeroes before importing again."
    );
  }
  return (
    "No players found. CricHeroes only list a player once they are named in " +
    "a match's playing squad, so before the first match there is nobody to " +
    "import."
  );
}

function describe(player: RosterImportPlayer, planned: boolean): string {
  switch (player.action) {
    case "create":
      return planned ? "Add" : "Added";
    case "link": {
      const team =
        player.player_team && player.player_team !== player.team
          ? ` (here on ${player.player_team})`
          : "";
      return `${planned ? "Link to" : "Linked to"} ${player.player_name}${team}`;
    }
    case "linked":
      return player.player_name && player.player_name !== player.name
        ? `Already linked to ${player.player_name}`
        : "Already linked";
    case "skip":
      return `${planned ? "Skip" : "Skipped"}: ${player.reason ?? "not imported"}`;
  }
}
