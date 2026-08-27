/**
 * A one-at-a-time gate for an action that must never run twice concurrently.
 *
 * Built for the merchant till (G5). Two taps land on a touch screen far
 * faster than React can swap one screen for another, so "the button is gone
 * after the first tap" is not a guard — the second tap is already queued.
 * The gate flips SYNCHRONOUSLY, so the second caller sees it in the same
 * frame and is turned away before it can start a second request.
 *
 * This is a UI-side courtesy, never the authority: `verify_redemption`
 * remains idempotent server-side and a duplicate call still returns
 * `redemption_already_verified` (HTTP 409). What the gate prevents is the
 * damaging half of a double tap — the late 409 arriving AFTER the success
 * screen and overwriting a redemption that genuinely succeeded, which reads
 * at the counter as "already redeemed" and invites staff to re-take payment.
 *
 * Deliberately tiny and dependency-free so it can be unit-tested exactly the
 * way the counter uses it.
 */
export type SingleFlight = {
  /** True only if the caller may proceed; raises the gate as a side effect. */
  begin(): boolean;
  /** Lower the gate so the action can be attempted again. */
  end(): void;
  /** Whether an attempt is currently in flight. */
  readonly busy: boolean;
};

export function createSingleFlight(): SingleFlight {
  let inFlight = false;
  return {
    begin() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    end() {
      inFlight = false;
    },
    get busy() {
      return inFlight;
    },
  };
}
