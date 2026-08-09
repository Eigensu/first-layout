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
