/**
 * Hands the tapped queue row's claim code to the redeem keypad WITHOUT the
 * code ever leaving component memory.
 *
 * The first version navigated: `router.replace("/merchant/redeem?code=…")`,
 * which put a LIVE 6-digit redemption OTP into the till URL — and from there
 * into shared-device browser history, `Referer` headers, server access logs,
 * and PostHog's `$current_url` on every pageview and autocaptured event
 * (Cursor Security Agent MEDIUM on PR #277, D193). The repo already treated
 * this leak class as a defect once for the merchant-join phone handoff
 * (`merchant-join-handoff.ts`), which reached for sessionStorage because its
 * two surfaces are separate pages with a sign-in between them.
 *
 * This handoff needs less than that: `QueuePanel` and `RedeemKeypad` render
 * on the SAME page (`/merchant/redeem`), so a module-scope subscription is
 * enough — the code goes tap → callback → keypad state and exists nowhere
 * else. No URL, no storage, no navigation; a page refresh forgets it, which
 * is correct for a credential.
 *
 * Deliberately a single listener, not an emitter: exactly one keypad exists
 * per till page, and the last mount wins.
 */

type Listener = (code: string) => void;

let listener: Listener | null = null;

/**
 * Deliver a tapped claim code to the mounted keypad.
 * Returns false (and delivers nothing) for a malformed code or when no
 * keypad is listening — the caller treats that as "nothing happened".
 */
export function publishQueueCode(code: string): boolean {
  if (!/^\d{6}$/.test(code) || !listener) return false;
  listener(code);
  return true;
}

/** Keypad-side: register for tapped codes. Returns the unsubscribe. */
export function subscribeQueueCode(cb: Listener): () => void {
  listener = cb;
  return () => {
    if (listener === cb) listener = null;
  };
}

/**
 * The reverse channel: the keypad tells the queue panel that a redemption
 * completed, so the panel can drop the served shopper immediately instead of
 * waiting out its poll.
 *
 * Without it the panel kept a just-redeemed shopper listed and TAPPABLE for
 * up to a full poll interval, and tapping that stale row produced the
 * full-screen "Code not valid — Invalid or already-used code" takeover for a
 * customer staff had served seconds earlier: a frightening screen generated
 * by the happy path, on every redemption at a queue-using till. Carries no
 * data — it is a "refresh now" nudge, and the server remains the authority
 * on who is in the queue. D204.
 */
type VoidListener = () => void;

const redeemedListeners = new Set<VoidListener>();

/** Keypad-side: announce that a verification completed. */
export function publishRedemptionCompleted(): void {
  for (const cb of Array.from(redeemedListeners)) cb();
}

/** Panel-side: refresh when a verification completes. Returns unsubscribe. */
export function subscribeRedemptionCompleted(cb: VoidListener): () => void {
  redeemedListeners.add(cb);
  return () => {
    redeemedListeners.delete(cb);
  };
}
