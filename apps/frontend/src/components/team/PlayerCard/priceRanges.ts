export interface PriceRange {
  label: string;
  min: number;
  max: number;
}

/**
 * Fixed purse price bands shown as filter chips wherever players are picked
 * (team builder and both edit surfaces). Kept as one fixed list rather than
 * derived per-pool so the same chip always means the same range everywhere.
 */
export const PRICE_RANGES: PriceRange[] = [
  { label: "40L – 16L", min: 1_600_000, max: 4_000_000 },
  { label: "15.99L – 61K", min: 61_000, max: 1_599_000 },
  { label: "60.99K – 21K", min: 21_000, max: 60_990 },
  { label: "20.99K – 10K", min: 10_000, max: 20_990 },
  { label: "9.99K – 5K", min: 5_000, max: 9_990 },
];
