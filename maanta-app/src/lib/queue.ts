/**
 * Merchant shopper queue — shared constants and the staff-facing identity
 * rule (founder brief 2026-08-26 §26/§27).
 *
 * Identity minimisation is the rule, not a styling choice: staff need just
 * enough to CALL a shopper — first name + last initial. Full name, phone,
 * email, GPS and history never reach the queue payload; the API route builds
 * entries through `staffFacingName` and nothing else.
 */

/**
 * How long a check-in stays on the staff queue before it quietly drops off.
 * Queue expiry never touches the underlying claim — a shopper whose entry
 * lapsed and whose claim is still valid simply scans again.
 */
export const QUEUE_ENTRY_TTL_MINUTES = 10;

/** Poll cadence for the staff queue — the same 8s the ticket screen uses. */
export const QUEUE_POLL_MS = 8000;

/** "Amina Hassan" -> "Amina H." · "Amina" -> "Amina" · null -> "Shopper" */
export function staffFacingName(fullName: string | null | undefined): string {
  const trimmed = fullName?.trim();
  if (!trimmed) return "Shopper";
  const parts = trimmed.split(/\s+/);
  const first = parts[0];
  if (parts.length === 1) return first;
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

/** One row of the staff queue — the COMPLETE payload staff ever see. */
export type QueueEntry = {
  id: string;
  /** staffFacingName output — never the full name. */
  name: string;
  dealTitle: string;
  arrivedAt: string;
  fastVisitEligible: boolean;
  /** The claim code, so tapping a row feeds the existing keypad flow. */
  code: string;
};
