/** Gap between neighbouring cards when a column is (re)spaced. */
export const ORDER_STEP = 1024;
/** Below this gap a midpoint loses precision, so the column is re-spaced. */
const MIN_GAP = 1e-6;

/**
 * Position for a card dropped between `prev` (the card above) and `next` (the card below).
 * Fractional ordering means a drag-and-drop rewrites one row instead of the whole column.
 */
export function orderBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return ORDER_STEP;
  if (prev === null) return next! - ORDER_STEP;
  if (next === null) return prev + ORDER_STEP;
  return (prev + next) / 2;
}

/** True when two neighbours are so close that their midpoint would be indistinguishable from either. */
export const needsRespace = (prev: number | null, next: number | null) =>
  prev !== null && next !== null && Math.abs(next - prev) < MIN_GAP;

/** Evenly spaced orders for a column of `count` cards. */
export const respaced = (count: number) => Array.from({ length: count }, (_, i) => (i + 1) * ORDER_STEP);
