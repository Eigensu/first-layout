import { tournamentUrl } from "@/common/consts";
import type {
  PlayedTournament,
  RegisteredTournament,
} from "@/lib/api/tournaments";

export type AnyTournament = PlayedTournament | RegisteredTournament;

/**
 * Where a tournament can be opened from here, or null: not the site already
 * open, and not an archived one, whose subdomain no longer resolves.
 */
export function tournamentLink(
  tournament: AnyTournament,
  currentSlug: string | null,
): string | null {
  if (tournament.status === "archived" || tournament.slug === currentSlug) {
    return null;
  }
  return tournamentUrl(tournament.slug);
}

/** Points to one decimal place: sums of 1.5x vice-captain points run long. */
export function formatPoints(points: number): string {
  return (Math.round(points * 10) / 10).toLocaleString("en-US");
}
