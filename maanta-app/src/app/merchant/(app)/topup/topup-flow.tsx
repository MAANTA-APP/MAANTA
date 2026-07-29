"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AmountField, TextField } from "@/components/ui/inputs";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { IconCheck, IconClock, IconX } from "@/components/ui/icons";
import { formatKes } from "@/lib/ui";
import posthog from "posthog-js";

/**
 * 9i Top up.
 *
 * Two money rules govern this screen:
 *
 *  - **Pending is not credited** (R-STRIPE-PHASE-1). Returning from Stripe
 *    Checkout means the shopper *paid*, not that the wallet *has* the money —
 *    the balance moves when the webhook lands. So a return renders as pending
 *    and only becomes "credited" once the balance actually rises. Nothing here
 *    may show a success tick against an unsettled top-up.
 *  - **Never a toast for money.** Every failure and every pending state is a
 *    persistent inline surface the merchant can read at their own pace.
 *
 * TODO(D-06): card is the primary action because IntaSend credentials are
 * outstanding, so Stripe Checkout is the only rail that completes today. The
 * design system wants M-Pesa primary — reorder the two actions (and re-point the
 * primary Button) once M-Pesa STK is live.
 */
type Stage =
  | { kind: "form" }
  /** STK push sent; waiting on the IntaSend webhook. */
  | { kind: "waiting-mpesa" }
  /** Back from Stripe Checkout; waiting on the Stripe webhook. */
  | { kind: "waiting-card" }
  /** Balance has actually risen — the only state that says "added". */
  | { kind: "credited"; added: number; newBalance: number }
  /** Paid, but not settled inside the wait window. Never framed as a failure. */
  | { kind: "unsettled" }
  | { kind: "failed"; message: string };

const WAIT_LIMIT_MS = 120_000;

export function TopupFlow({
  balance,
  merchantPhone,
  initialAmount,
  stripeResult,
}: {
  balance: number;
  merchantPhone: string;
  initialAmount: number;
  stripeResult: string | null;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(initialAmount);
  const [phone, setPhone] = useState(merchantPhone);
  const [stage, setStage] = useState<Stage>(() =>
    stripeResult === "cancelled"
      ? {
          kind: "failed",
          message: "The card payment was cancelled. No money left your account.",
        }
      : // Returned from Checkout: PENDING, not credited. The webhook decides.
        stripeResult === "success"
        ? { kind: "waiting-card" }
        : { kind: "form" }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startBalance = useRef(balance);
  const waitStart = useRef(0);

  const waiting = stage.kind === "waiting-mpesa" || stage.kind === "waiting-card";

  // Poll the wallet until the webhook credits it. Shared by both rails: the
  // only thing that promotes a top-up to "credited" is the balance rising.
  useEffect(() => {
    if (!waiting) return;
    if (waitStart.current === 0) waitStart.current = Date.now();
    const isCard = stage.kind === "waiting-card";
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/wallet");
        if (res.ok) {
          const body = await res.json();
          if (body.balance > startBalance.current) {
            setStage({
              kind: "credited",
              added: body.balance - startBalance.current,
              newBalance: body.balance,
            });
            router.refresh();
            return;
          }
        }
      } catch {
        /* keep polling — a dropped poll is not a payment failure */
      }
      if (Date.now() - waitStart.current > WAIT_LIMIT_MS) {
        // An STK push that never lands means the customer dismissed it, so no
        // money moved. A card payment already went through Checkout, so timing
        // out here says nothing about the money — never call that a failure.
        setStage(
          isCard
            ? { kind: "unsettled" }
            : {
                kind: "failed",
                message:
                  "The STK push was cancelled or timed out. No money left your account.",
              }
        );
      }
    }, 4000);
    return () => clearInterval(t);
  }, [waiting, stage.kind, router]);

  const backToForm = useCallback(() => {
    waitStart.current = 0;
    setStage({ kind: "form" });
  }, []);

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
      setStage({ kind: "waiting-mpesa" });
    } catch {
      setBusy(false);
      setError("Network error — please try again.");
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
      setError("Network error — please try again.");
    }
  }

  // Credited — the balance has actually moved. The only tick on this screen.
  if (stage.kind === "credited") {
    return (
      <main className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-verified-tint">
          <IconCheck className="h-8 w-8 text-verified" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">
          {formatKes(stage.added)} added
        </h1>
        <p className="tnum mt-2 text-sm text-secondary">
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

  // Paid, not yet settled. No tick, no "added", no implied credit.
  if (stage.kind === "unsettled") {
    return (
      <main className="mx-auto flex max-w-mobile flex-col items-center px-6 py-20 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] border-line bg-white">
          <IconClock className="h-8 w-8 text-ink" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">Top-up still pending</h1>
        <InlineAlert variant="warning" title="Not credited yet." className="mt-4 text-left">
          Your card payment went through, but the wallet hasn&apos;t been credited
          yet. It usually settles within a few minutes. Redemptions keep working in
          the meantime — any fee is recorded as arrears and cleared when this
          lands.
        </InlineAlert>
        <Button
          full
          className="mt-6"
          onClick={() => {
            router.push("/merchant/wallet");
            router.refresh();
          }}
        >
          Check wallet
        </Button>
      </main>
    );
  }

  // Back from Checkout, webhook not in yet. Its own screen, because the
  // merchant has already paid — dropping them on the top-up form invites a
  // second payment for the same money.
  if (stage.kind === "waiting-card") {
    return (
      <main className="mx-auto flex max-w-mobile flex-col items-center px-6 py-20 text-center">
        <span
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-ink"
        />
        <h1 className="mt-5 text-2xl font-bold text-ink">Confirming your payment</h1>
        <InlineAlert variant="warning" title="Not credited yet." className="mt-4 text-left">
          Your card payment went through. The wallet is credited when the payment
          settles — usually a few moments. Don&apos;t pay again.
        </InlineAlert>
      </main>
    );
  }

  if (stage.kind === "failed") {
    return (
      <main className="mx-auto flex max-w-mobile flex-col items-center px-6 py-20 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-flame-tint">
          <IconX className="h-8 w-8 text-flame" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">Top-up not completed</h1>
        <p className="mt-2 text-sm text-secondary">{stage.message}</p>
        <Button full className="mt-8" onClick={payWithCard} loading={busy}>
          Pay by card
        </Button>
        <Button variant="ghost" full className="mt-3" onClick={backToForm}>
          Back to top up
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-mobile px-5 pt-6">
      <h1 className="text-center text-lg font-bold text-ink">Top up</h1>

      <div className="mt-6">
        <AmountField value={amount} onChange={setAmount} />
      </div>

      {/* Money errors are a persistent inline surface, never a toast. */}
      {error ? (
        <InlineAlert variant="error" className="mt-4">
          {error}
        </InlineAlert>
      ) : null}

      {/* Card first (TODO(D-06)) — the only rail that completes while IntaSend
          credentials are outstanding, so it carries the single amber action. */}
      <Button full className="mt-6" onClick={payWithCard} loading={busy}>
        Pay by card
      </Button>
      <p className="mt-2 text-center text-xs text-muted">
        Your balance updates when the payment settles.
      </p>

      <p className="my-5 text-center text-xs text-faint">or</p>

      <TextField
        label="M-Pesa number"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+254 7XX XXX XXX"
      />
      <Button
        variant="ghost"
        full
        className="mt-3"
        onClick={sendStk}
        loading={busy}
        disabled={!amount || amount <= 0 || !phone.trim()}
      >
        Send STK push
      </Button>

      {stage.kind === "waiting-mpesa" ? (
        <div className="mt-3 flex h-12 items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold text-muted">
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink"
          />
          Waiting for M-Pesa confirmation…
        </div>
      ) : null}
    </main>
  );
}
