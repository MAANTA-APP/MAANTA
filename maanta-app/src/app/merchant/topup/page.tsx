"use client";

import { useState, type FormEvent } from "react";

type TopupState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "success" }
  | { step: "error"; message: string };

export default function MerchantTopupPage() {
  const [amount, setAmount] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+254");
  const [state, setState] = useState<TopupState>({ step: "idle" });

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
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Check your phone</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Enter your M-Pesa PIN on the STK prompt to complete the top-up.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Top Up Balance</h1>
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
          {state.step === "loading" ? "Sending STK push…" : "Top Up"}
        </button>
        {state.step === "error" && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}
      </form>
    </main>
  );
}
