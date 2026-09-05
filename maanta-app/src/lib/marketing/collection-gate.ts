/**
 * The collection gate — founder ruling 2026-09-05 (register D274).
 *
 * MAANTA's pre-launch sequence is: presence → discoverability → a tested
 * acquisition journey → the incorporation/compliance gate → live waitlist →
 * first genuine campaign. Until this session there was no switch between the
 * third step and the fifth: `/waitlist` rendered its form and `POST
 * /api/waitlist` accepted anyone the moment Resend was configured. Presence and
 * discoverability were therefore inseparable from collection. This constant
 * separates them.
 *
 * ## What "closed" means
 *
 * - `/waitlist` and `/merchants/join` render a "not open yet" panel with no
 *   form. Nothing is asked for; nothing is stored.
 * - `POST /api/waitlist` and `POST /api/merchants/interest` refuse with 403
 *   before validation, before the rate limit, before any write.
 * - **A verified TEST entry still passes.** The journey has to be testable
 *   while collection is closed — that is the third step of the sequence — so a
 *   signup carrying the shared secret (`WAITLIST_TEST_TOKEN`) renders the form
 *   and is accepted, tagged TEST, held out of every real count as before.
 *
 * ## Flipping it
 *
 * A code constant, not an environment variable, on purpose: opening genuine
 * collection is a governance act with a record, not a dashboard toggle. To
 * open: change this value to `"open"`, and in the same commit add a
 * decisions-log row citing (a) the incorporation/compliance gate passed, (b) the
 * D269 channel posture re-examined, (c) the D270 compliance recheck done. The
 * guard in `collection-gate.test.ts` pins the current state so a flip cannot
 * ride in unnoticed inside another change.
 *
 * Baseline at closure: 2 internal test rows, 0 genuine external signups.
 */
export type CollectionGate = "closed" | "open";

export const COLLECTION_GATE = "closed" as CollectionGate;

export const COLLECTION_OPEN: boolean = COLLECTION_GATE === "open";

/** May this submission be collected? A verified test entry always may. */
export function collectionAllowed(isTest: boolean): boolean {
  return COLLECTION_OPEN || isTest;
}

export const WAITLIST_CLOSED_MESSAGE = "The waitlist is not open yet.";
export const MERCHANT_INTEREST_CLOSED_MESSAGE = "Shop registration is not open yet.";
