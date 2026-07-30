/**
 * Top-up settlement rule — `R-STRIPE-PHASE-1`: **pending never means credited.**
 *
 * A top-up has two independent halves and the UI must not conflate them:
 *
 *   1. the payment (Stripe Checkout completing, or an M-Pesa STK push accepted)
 *   2. the wallet credit (our webhook landing and the ledger moving)
 *
 * Stripe redirects back to `/merchant/topup?stripe=success` the moment the
 * *checkout session* completes — which is before our webhook has necessarily
 * credited anything. Declaring success there is a money lie, and the card rail
 * previously did exactly that: it rendered the green success takeover with
 * `added: 0` and the pre-payment balance.
 *
 * So the return lands in `confirming`, the screen polls the wallet, and only a
 * real balance increase produces `credited`.
 *
 * The two rails also fail differently, and the copy must reflect that:
 *
 *   - an **STK** push that times out was cancelled or never accepted — no money
 *     moved, and the merchant should be told so plainly;
 *   - a **card** payment that returns `success` but has not credited yet HAS
 *     been taken by Stripe. Telling that merchant "no money left your account"
 *     would be false and would invite a second payment.
 */

export type TopupRail = "card" | "mpesa";

export type TopupStage =
  | { kind: "form" }
  /** Payment accepted or in flight; wallet not yet credited. Polling. */
  | { kind: "confirming"; rail: TopupRail }
  | { kind: "credited"; added: number; newBalance: number }
  /** Terminal, but not necessarily a failure — see `moneyMoved`. */
  | { kind: "unsettled"; rail: TopupRail; message: string }
  | { kind: "failed"; message: string };

/** How long to poll for the webhook before showing a terminal message. */
export const SETTLE_WAIT_LIMIT_MS = 120_000;

/**
 * Where the screen starts, given Stripe's `?stripe=` return parameter.
 *
 * `success` is deliberately NOT a success stage — it means the checkout
 * completed, nothing more.
 */
export function initialStageFromStripeReturn(
  stripeResult: string | null
): TopupStage {
  if (stripeResult === "success") return { kind: "confirming", rail: "card" };
  if (stripeResult === "cancelled") {
    return {
      kind: "failed",
      message: "The card payment was cancelled. No money left your account.",
    };
  }
  return { kind: "form" };
}

/**
 * Decide the next stage while polling. `null` means "keep waiting".
 *
 * A balance increase is the ONLY thing that produces `credited` — the amount
 * shown is the observed delta, never the amount the merchant typed, so the
 * figure on the success screen is always the money that actually arrived.
 */
export function settlementOutcome(args: {
  rail: TopupRail;
  startBalance: number;
  balanceNow: number | null;
  elapsedMs: number;
}): TopupStage | null {
  const { rail, startBalance, balanceNow, elapsedMs } = args;

  if (balanceNow !== null && balanceNow > startBalance) {
    return {
      kind: "credited",
      added: balanceNow - startBalance,
      newBalance: balanceNow,
    };
  }

  if (elapsedMs > SETTLE_WAIT_LIMIT_MS) {
    return rail === "mpesa"
      ? {
          kind: "failed",
          message:
            "The STK push was cancelled or timed out. No money left your account.",
        }
      : {
          // Stripe has the money. Never imply otherwise, and never invite a
          // second payment.
          kind: "unsettled",
          rail: "card",
          message:
            "Your card payment went through, but the balance hasn't updated yet. It usually lands within a few minutes — check your wallet, and contact support if it doesn't.",
        };
  }

  return null;
}

/** Whether money has definitely left the merchant's account in this stage. */
export function moneyMoved(stage: TopupStage): boolean {
  if (stage.kind === "credited") return true;
  // A card payment that returned `success` was taken even if we can't see the
  // credit yet; an unaccepted STK push was not.
  return (
    (stage.kind === "confirming" || stage.kind === "unsettled") &&
    stage.rail === "card"
  );
}
