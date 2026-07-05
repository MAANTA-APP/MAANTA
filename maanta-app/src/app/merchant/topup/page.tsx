"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

type MpesaState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "success" }
  | { step: "error"; message: string };

type StripeState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "error"; message: string };

function MpesaTopup() {
  const [amount, setAmount] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+254");
  const [state, setState] = useState<MpesaState>({ step: "idle" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState({ step: "loading" });
    try {
      const res = await fetch("/api/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), phoneNumber }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({
          step: "error",
          message: body.error ?? "Could not start payment.",
        });
        return;
      }
      setState({ step: "success" });
    } catch {
      setState({ step: "error", message: "Network error — please try again." });
    }
  }

  if (state.step === "success") {
    return (
      <div className="flex flex-col items-center gap-2 rounded border border-black/10 p-6 text-center dark:border-white/20">
        <p className="font-medium">Check your phone</p>
        <p className="text-sm text-black/60 dark:text-white/60">
          Enter your M-Pesa PIN on the STK prompt to complete the top-up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Amount (KES)
        <input
          type="number"
          min="1"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="500"
          className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        M-Pesa phone number
        <input
          type="tel"
          required
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+254712345678"
          className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>
      <button
        type="submit"
        disabled={state.step === "loading"}
        className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {state.step === "loading" ? "Sending STK push…" : "Top Up with M-Pesa"}
      </button>
      {state.step === "error" && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}
    </form>
  );
}

function StripeTopup() {
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<StripeState>({ step: "idle" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState({ step: "loading" });
    try {
      const res = await fetch("/api/topup/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({
          step: "error",
          message: body.error ?? "Could not start payment.",
        });
        return;
      }
      window.location.href = body.checkoutUrl;
    } catch {
      setState({ step: "error", message: "Network error — please try again." });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Amount (KES)
        <input
          type="number"
          min="1"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="500"
          className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>
      <button
        type="submit"
        disabled={state.step === "loading"}
        className="rounded border border-black/10 px-4 py-2 text-sm font-medium dark:border-white/20 disabled:opacity-50"
      >
        {state.step === "loading" ? "Redirecting…" : "Top Up with Card (Stripe)"}
      </button>
      {state.step === "error" && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}
    </form>
  );
}

function StripeResultBanner() {
  const searchParams = useSearchParams();
  const stripeResult = searchParams.get("stripe");

  if (stripeResult === "success") {
    return (
      <p className="rounded bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
        Payment received — your balance will update shortly.
      </p>
    );
  }
  if (stripeResult === "cancelled") {
    return (
      <p className="rounded bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
        Checkout cancelled — no charge was made.
      </p>
    );
  }
  return null;
}

export default function MerchantTopupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Top Up Balance</h1>

      <Suspense fallback={null}>
        <StripeResultBanner />
      </Suspense>

      <MpesaTopup />

      <div className="flex items-center gap-2 text-xs text-black/40 dark:text-white/40">
        <div className="h-px flex-1 bg-black/10 dark:bg-white/20" />
        or
        <div className="h-px flex-1 bg-black/10 dark:bg-white/20" />
      </div>

      <StripeTopup />
    </main>
  );
}
