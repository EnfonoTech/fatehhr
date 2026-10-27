// "You did not check out": the last punch is an IN older than a shift can be.
// Cooperheat 2026-10: people forgot to check out in the evening, then tapped
// Check Out + Check In the next morning, so the evening OUT was lost and no
// attendance was made. The Check Out screen now asks when they finished.

/** Longest shift (fatehhr/api/checkin.py and cooperheat work_day MAX_SHIFT_HOURS). */
export const MAX_SHIFT_HOURS = 16;
/** How far back an employee may set a punch (spec §7). */
export const BACKDATE_HOURS = 24;

const HOUR = 3600 * 1000;

export interface ForgotCheckout {
  /** When the forgotten shift started. */
  inMs: number;
  /** Earliest and latest finish time the employee may pick. */
  minMs: number;
  maxMs: number;
  /** The shift is too old to close from the app (ask the supervisor). */
  tooOld: boolean;
}

export function forgotCheckout(
  lastRow: { log_type?: string; time?: string | null } | null | undefined,
  now: number = Date.now(),
): ForgotCheckout | null {
  if (!lastRow || lastRow.log_type !== "IN" || !lastRow.time) return null;
  const inMs = Date.parse(lastRow.time);
  if (Number.isNaN(inMs) || now - inMs <= MAX_SHIFT_HOURS * HOUR) return null;
  const minMs = Math.max(inMs, now - BACKDATE_HOURS * HOUR);
  const maxMs = Math.min(inMs + MAX_SHIFT_HOURS * HOUR, now);
  return { inMs, minMs, maxMs, tooOld: maxMs <= minMs };
}
