/**
 * Rounds a points value to at most 2 decimal places for display.
 *
 * Fantasy point sums accumulate floating-point tails (e.g. 21.453000000000003
 * from summing per-ball scores), so raw values can render far longer than
 * intended. This caps the decimals without padding whole numbers with
 * trailing zeros (67, not 67.00).
 */
export function formatPoints(value: number | null | undefined): number {
  return Math.round((value ?? 0) * 100) / 100;
}
