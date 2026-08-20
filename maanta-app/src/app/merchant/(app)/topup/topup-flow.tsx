"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AmountField, TextField } from "@/components/ui/inputs";
import { Button } from "@/components/ui/button";
import { IconCheck, IconX } from "@/components/ui/icons";
import { InlineAlert } from "@/components/ui/inline-alert";
import { isValidKenyanPhone } from "@/lib/phone";
import { formatKes } from "@/lib/ui";
import posthog from "posthog-js";

type Stage =
  | { kind: "form" }
  | { kind: "waiting" }
  | { kind: "success"; added: number; newBalance: number }
  | { kind: "failed"; message: string };

const WAIT_LIMIT_MS = 120_000;

/**
 * Wallet top-up. Shipped Phase 1 rail is Stripe Checkout (card).
 * M-Pesa STK is offered only when IntaSend is configured — never as the
 * default primary CTA, so a founder E2E session is not misled into treating
 * STK as live.
 */
export function TopupFlow({
  balance,
  merchantPhone,
  initialAmount,
  stripeResult,
  mpesaAvailable = false,
}: {
  balance: number;
  merchantPhone: string;
  initialAmount: number;
  stripeResult: string | null;
  /** True only when IntaSend API keys are present on the server. */
  mpesaAvailable?: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(initialAmount);
  // Prefill only a number M-Pesa can actually reach. The shop's contact number
  // may be foreign — the admin-assisted onboarding route accepts international
  // numbers, since that field is a contact and a pilot shop's owner need not be
  // in Kenya — while /api/topup validates the *submitted* number as Kenyan,
  // because a non-Kenyan MSISDN cannot receive an STK push. Seeding the field
  // with a number the next click rejects is a dead end that reads as a bug in
  // the payment, not as a mismatched contact detail. Empty is honest: it asks
  // for the M-Pesa number rather than pretending to know it.
  const [phone, setPhone] = useState(
    isValidKenyanPhone(merchantPhone) ? merchantPhone : ""
  );
  const [stage, setStage] = useState<Stage>(() =>
    stripeResult === "cancelled"
      ? { kind: "failed", message: "The card payment was cancelled. No money left your account." }
      : stripeResult === "success"
        ? { kind: "success", added: 0, newBalance: balance }
        : { kind: "form" }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startBalance = useRef(balance);
  const waitStart = useRef(0);

  // While waiting on the STK push, poll the wallet until the webhook credits it.
  useEffect(() => {
    if (stage.kind !== "waiting") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/wallet");
        if (res.ok) {
          const body = await res.json();
          if (body.balance > startBalance.current) {
            setStage({
              kind: "success",
              added: body.balance - startBalance.current,
              newBalance: body.balance,
            });
            router.refresh();
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      if (Date.now() - waitStart.current > WAIT_LIMIT_MS) {
        setStage({
          kind: "failed",
          message: "The STK push was cancelled or timed out. No money left your account.",
        });
      }
    }, 4000);
    return () => clearInterval(t);
  }, [stage.kind, router]);

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
      setStage({ kind: "waiting" });
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

  if (stage.kind === "success") {
    return (
      <main className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-verified-tint">
          <IconCheck className="h-8 w-8 text-verified" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">
          {stage.added > 0 ? `${formatKes(stage.added)} added` : "Top-up received"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {stage.added > 0 ? (
            <>
              New balance: <b className="text-ink">{formatKes(stage.newBalance)}</b>
            </>
          ) : (
            "Your balance updates as soon as the payment is confirmed."
          )}
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

      <InlineAlert
        variant="warning"
        title="Card top-up is the live Phase 1 rail."
        className="mt-4"
      >
        Stripe Checkout credits your wallet after payment. M-Pesa STK is available
        only when configured — do not assume it is live for every environment.
      </InlineAlert>

      <div className="mt-6">
        <AmountField value={amount} onChange={setAmount} />
      </div>

      {error ? (
        <p className="mt-3 text-sm font-medium text-ink" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        full
        className="mt-6"
        onClick={payWithCard}
        loading={busy && stage.kind === "form"}
        disabled={!amount || amount <= 0}
        data-testid="topup-card-primary"
      >
        Pay with card
      </Button>

      {mpesaAvailable ? (
        <>
          <p className="my-4 text-center text-xs text-faint">or M-Pesa</p>
          <div className="mt-1">
            <TextField
              label="M-Pesa number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+254 7XX XXX XXX"
            />
          </div>
          <Button
            variant="ghost"
            full
            className="mt-4"
            onClick={sendStk}
            loading={busy}
            disabled={!amount || amount <= 0 || !phone.trim()}
            data-testid="topup-stk-secondary"
          >
            Send STK push
          </Button>
          {stage.kind === "waiting" ? (
            <div
              className="mt-3 flex h-12 items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold text-muted"
              role="status"
            >
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink"
              />
              Waiting for M-Pesa confirmation…
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-center text-xs text-muted" data-testid="topup-mpesa-unavailable">
          M-Pesa STK is not configured in this environment.
        </p>
      )}
    </main>
  );
}
