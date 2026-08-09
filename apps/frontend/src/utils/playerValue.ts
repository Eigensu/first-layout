import { CONTEST_FORMAT, type ContestFormat } from "@/common/consts/contest";

/**
 * Format an auction points figure, e.g. 200000 -> "200,000".
 */
export function formatPoints(value: number): string {
  return Math.round(value).toLocaleString();
}

/**
 * Render a player's `price` the way the given contest format means it.
 *
 * The two formats share one `players` collection and one `price` field, but
 * read it differently: slot-based contests treat it as a rupee price tag,
 * while auction contests treat it as the points a player sold for. Labelling
 * it per format keeps auction figures from reading as rupees in a slot-based
 * contest and vice versa.
 */
export function formatPlayerValue(
  value: number,
  format: ContestFormat | undefined,
): string {
  if (format === CONTEST_FORMAT.AUCTION_PURSE) {
    return formatPoints(value);
  }
  return `₹${Math.floor(value)}`;
}

/** Column label that goes with `formatPlayerValue`. */
export function playerValueLabel(format: ContestFormat | undefined): string {
  return format === CONTEST_FORMAT.AUCTION_PURSE ? "Sold For" : "Price";
}
