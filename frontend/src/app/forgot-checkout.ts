// "You did not check out": the last punch is an IN older than a shift can be.
// Cooperheat 2026-10: people forgot to check out in the evening, then tapped
// Check Out + Check In the next morning, so the evening OUT was lost and no
// attendance was made. The Check Out screen now asks when they finished.
// Client rule (2026-10-28): after 24 h the server closes the check-in itself
// (8 hours, with a note for the supervisor), so the employee simply checks in.

/** Longest shift (fatehhr/api/checkin.py and cooperheat work_day MAX_SHIFT_HOURS). */
export const MAX_SHIFT_HOURS = 16;
/** How far back an employee may set a punch (spec §7). */
export const BACKDATE_HOURS = 24;
/** After this the server closes the check-in (cooperheat auto_checkout.OPEN_HOURS). */
export const AUTO_CLOSE_HOURS = 24;
/** A check-in from this hour on is a night shift: it finishes the next day. */
export const NIGHT_SHIFT_FROM_HOUR = 15;

const HOUR = 3600 * 1000;

export interface ForgotCheckout {
  /** When the forgotten shift started. */
  inMs: number;
  /** Earliest and latest finish time the employee may pick. */
  minMs: number;
  maxMs: number;
  /** Older than AUTO_CLOSE_HOURS: the system closes it, the employee checks in again. */
  autoClosed: boolean;
}

export function forgotCheckout(
  lastRow: { log_type?: string; time?: string | null } | null | undefined,
  now: number = Date.now(),
): ForgotCheckout | null {
  if (!lastRow || lastRow.log_type !== "IN" || !lastRow.time) return null;
  const inMs = Date.parse(lastRow.time);
  if (Number.isNaN(inMs) || now - inMs <= MAX_SHIFT_HOURS * HOUR) return null;
  let minMs = Math.max(inMs, now - BACKDATE_HOURS * HOUR);
  const inAt = new Date(inMs);
  if (inAt.getHours() >= NIGHT_SHIFT_FROM_HOUR) {
    // night shift: only the second day can be the finish date
    const nextDay = new Date(inAt.getFullYear(), inAt.getMonth(), inAt.getDate() + 1).getTime();
    minMs = Math.max(minMs, nextDay);
  }
  const maxMs = Math.min(inMs + MAX_SHIFT_HOURS * HOUR, now);
  const autoClosed = now - inMs > AUTO_CLOSE_HOURS * HOUR || maxMs <= minMs;
  return { inMs, minMs, maxMs, autoClosed };
}
