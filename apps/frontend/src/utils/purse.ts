/**
 * The one purse comparison every screen uses.
 *
 * Prices are floats, and the client and server can add a squad's prices in a
 * different order, so a squad that exactly fits can total a hair over the
 * purse. The server allows the same slack (PURSE_TOLERANCE in
 * apps/backend/app/services/auction.py), so the picker, Continue, Save and the
 * server all agree on which squads fit.
 */
export const PURSE_TOLERANCE = 1e-6;

/** True when a squad costing `total` is over `purse`. */
export function isOverPurse(total: number, purse: number): boolean {
  return total > purse + PURSE_TOLERANCE;
}

/** True when `remaining` purse (purse minus spend) means the squad is over. */
export function isOverspent(remaining: number): boolean {
  return remaining < -PURSE_TOLERANCE;
}
