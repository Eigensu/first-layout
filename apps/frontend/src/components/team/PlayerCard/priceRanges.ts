export interface PriceRange {
  label: string;
  min: number;
  max: number;
}

/**
 * Fixed purse price bands shown as filter chips wherever players are picked
 * (team builder and both edit surfaces). Kept as one fixed list rather than
 * derived per-pool so the same chip always means the same range everywhere.
 *
 * The top and bottom bands are open-ended: price has no configured upper
 * bound and only a >= 0 lower bound, so a closed range at either end would
 * silently drop players outside it from every price-filtered result.
 */
export const PRICE_RANGES: PriceRange[] = [
  { label: "40L+", min: 1_600_000, max: Infinity },
  { label: "15.99L – 61K", min: 61_000, max: 1_599_999 },
  { label: "60.99K – 21K", min: 21_000, max: 60_999 },
  { label: "20.99K – 10K", min: 10_000, max: 20_999 },
  { label: "Under 10K", min: 0, max: 9_999 },
];

/**
 * Fixed bands for auction pools, whose `price` is points on the purse's own
 * scale rather than rupees — so the rupee bands above would bucket a whole
 * auction pool into one or two chips.
 *
 * Each band runs from its own `min` up to just under the next one's, so a
 * player on a boundary lands in the higher band: 250,000 is "250k+" and
 * 200,000 is "200–250k". The ends stay open for the same reason as above.
 */
export const AUCTION_PRICE_RANGES: PriceRange[] = [
  { label: "250k+", min: 250_000, max: Infinity },
  { label: "200–250k", min: 200_000, max: 249_999 },
  { label: "150–200k", min: 150_000, max: 199_999 },
  { label: "100–150k", min: 100_000, max: 149_999 },
  { label: "75–100k", min: 75_000, max: 99_999 },
  { label: "50–75k", min: 50_000, max: 74_999 },
  { label: "25–50k", min: 25_000, max: 49_999 },
  { label: "10–25k", min: 10_000, max: 24_999 },
  { label: "Below 10k", min: 0, max: 9_999 },
];

/** The bands that match how the pool's `price` should be read. */
export function priceRangesFor(isAuction: boolean): PriceRange[] {
  return isAuction ? AUCTION_PRICE_RANGES : PRICE_RANGES;
}
