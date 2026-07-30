"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AmountField, TextField } from "@/components/ui/inputs";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconCheck, IconX } from "@/components/ui/icons";
import { formatKes } from "@/lib/ui";
import {
  initialStageFromStripeReturn,
  settlementOutcome,
  type TopupStage,
} from "@/lib/topup-settlement";
import posthog from "posthog-js";

/**
 * 9i Top up with 10s/10t result screens.
 *
 * Two rails, and which one leads is CURRENT REALITY, not preference:
 * card (Stripe Checkout) is the Phase 1 rail that actually works, and M-Pesa
 * STK (IntaSend) is planned/blocked on credentials. When `mpesaEnabled` is
 * false the M-Pesa form is not rendered at all — offering a "Send STK push"
 * button that can only 503 is a dead end, and showing it implies a live rail
 * MAANTA does not have.
 */
export function TopupFlow({
  balance,
  merchantPhone,
  initialAmount,
  stripeResult,
  mpesaEnabled = true,
}: {
  balance: number;
  merchantPhone: string;
  initialAmount: number;
  stripeResult: string | null;
  mpesaEnabled?: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(initialAmount);
  const [phone, setPhone] = useState(merchantPhone);
  // R-STRIPE-PHASE-1: a Stripe `?stripe=success` return means the CHECKOUT
  // completed, not that the wallet was credited — so it starts `confirming` and
  // the effect below polls until the webhook lands. This used to render the
  // green success takeover immediately, with `added: 0` and the pre-payment
  // balance, which claimed a credit that had not happened.
  const [stage, setStage] = useState<TopupStage>(() =>
    initialStageFromStripeReturn(stripeResult)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startBalance = useRef(balance);
  const waitStart = useRef(0);

  // Poll the wallet until the webhook credits it — for BOTH rails. The card
  // rail previously never polled, so its `credited` state could not render at
  // all; a merchant had to leave and come back to see their own top-up.
  const rail = stage.kind === "confirming" ? stage.rail : null;
  useEffect(() => {
    if (!rail) return;
    if (!waitStart.current) waitStart.current = Date.now();
    const t = setInterval(async () => {
      let balanceNow: number | null = null;
      try {
        const res = await fetch("/api/wallet");
        if (res.ok) balanceNow = (await res.json()).balance ?? null;
      } catch {
        /* treat as no reading and keep polling */
      }
      const next = settlementOutcome({
        rail,
        startBalance: startBalance.current,
        balanceNow,
        elapsedMs: Date.now() - waitStart.current,
      });
      if (next) {
        setStage(next);
        if (next.kind === "credited") router.refresh();
      }
    }, 4000);
    return () => clearInterval(t);
  }, [rail, router]);

  async function sendStk() {
    setBusy(true);
    setError(null);
    posthog.capture("topup_stk_initiated", { amount_kes: amount });
    try {
      const res = await fetch("/api/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, phoneNumber: phone }),
      });
      const body = await res.json();
      setBusy(false);
      if (!res.ok) {
        setError(body.error ?? "Could not start the M-Pesa payment.");
        return;
      }
      waitStart.current = Date.now();
      setStage({ kind: "confirming", rail: "mpesa" });
    } catch {
      setBusy(false);
      setError("Network error — try again.");
    }
  }

  async function payWithCard() {
    setBusy(true);
    setError(null);
    posthog.capture("topup_card_initiated", { amount_kes: amount });
    try {
      const res = await fetch("/api/topup/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const body = await res.json();
      if (!res.ok) {
        setBusy(false);
        setError(body.error ?? "Could not start the card payment.");
        return;
      }
      window.location.href = body.checkoutUrl;
    } catch {
      setBusy(false);
      setError("Network error — try again.");
    }
  }

  if (stage.kind === "confirming") {
    return (
      <main className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <span
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink"
        />
        <h1 className="mt-5 text-2xl font-bold text-ink">
          {stage.rail === "card" ? "Confirming your payment" : "Waiting for M-Pesa"}
        </h1>
        <p className="mt-2 text-sm text-secondary" aria-live="polite">
          {stage.rail === "card"
            ? "Your card payment went through. We're waiting for it to land in your wallet — this usually takes a few seconds."
            : "Approve the STK push on your phone. Your balance updates as soon as it clears."}
        </p>
      </main>
    );
  }

  if (stage.kind === "credited") {
    return (
      <main className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-verified-tint">
          <IconCheck className="h-8 w-8 text-verified" />
        </span>
        {/* The amount shown is the OBSERVED balance delta, never the amount the
            merchant typed — so this figure is always the money that arrived. */}
        <h1 className="mt-5 text-2xl font-bold text-ink">
          {formatKes(stage.added)} added
        </h1>
        <p className="mt-2 text-sm text-muted">
          New balance: <b className="text-ink">{formatKes(stage.newBalance)}</b>
        </p>
        <Button
          full
          className="mt-8"
          onClick={() => {
            router.push("/merchant/redeem");
            router.refresh();
          }}
        >
          Done
        </Button>
      </main>
    );
  }

  // Card payment taken but not yet credited. Deliberately NOT the failure
  // screen: the money moved, so a red "not completed" would be false and would
  // invite a second payment. Rust (warning), and no retry CTA.
  if (stage.kind === "unsettled") {
    return (
      <main className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-ink">Payment received</h1>
        <p className="mt-2 text-sm text-secondary">{stage.message}</p>
        <ButtonLink href="/merchant/wallet" full className="mt-8">
          Open wallet
        </ButtonLink>
      </main>
    );
  }

  if (stage.kind === "failed") {
    return (
      <main className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-flame-tint">
          <IconX className="h-8 w-8 text-flame" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">Top-up not completed</h1>
        <p className="mt-2 text-sm text-muted">{stage.message}</p>
        <Button full className="mt-8" onClick={() => setStage({ kind: "form" })}>
          Try again
        </Button>
        <Button variant="ghost" full className="mt-3" onClick={payWithCard} loading={busy}>
          Pay with card
        </Button>
      </main>
    );
  }

  return (
    <main className="px-5 pt-6">
      <h1 className="text-center text-lg font-bold text-ink">Top up</h1>

      <div className="mt-6">
        <AmountField value={amount} onChange={setAmount} />
      </div>

      {mpesaEnabled ? (
        <>
          <div className="mt-5">
            <TextField
              label="M-Pesa number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+254 7XX XXX XXX"
            />
          </div>

          {error ? <p className="mt-3 text-sm font-medium text-ink">{error}</p> : null}

          <Button
            full
            className="mt-6"
            onClick={sendStk}
            loading={busy}
            disabled={!amount || amount <= 0 || !phone.trim()}
          >
            Send STK push
          </Button>

          <p className="my-4 text-center text-xs text-faint">or</p>

          <Button
            variant="ghost"
            full
            onClick={payWithCard}
            loading={busy && stage.kind === "form"}
          >
            Pay with card
          </Button>
        </>
      ) : (
        <>
          {error ? <p className="mt-3 text-sm font-medium text-ink">{error}</p> : null}

          <Button
            full
            className="mt-6"
            onClick={payWithCard}
            loading={busy}
            disabled={!amount || amount <= 0}
          >
            Pay with card
          </Button>

          {/* Honest about the rail that isn't live yet — no M-Pesa form, no
              button that can only fail. Rust (warning), never red. */}
          <p className="mt-4 text-center text-xs text-muted">
            M-Pesa top-up is coming. For now, card payment is the way to add
            funds — your balance updates as soon as the payment clears.
          </p>
        </>
      )}
    </main>
  );
}
