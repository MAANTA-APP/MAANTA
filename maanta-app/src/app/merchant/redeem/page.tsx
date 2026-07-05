"use client";

import { useState, type FormEvent } from "react";

type VerifyState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "success"; dealTitle: string }
  | { step: "error"; message: string };

export default function MerchantRedeemPage() {
  const [otp, setOtp] = useState("");
  const [state, setState] = useState<VerifyState>({ step: "idle" });

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setState({ step: "loading" });
    try {
      const res = await fetch("/api/redemptions/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpCode: otp }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({
          step: "error",
          message: body.error ?? "Could not verify this code.",
        });
        return;
      }
      setState({ step: "success", dealTitle: body.dealTitle });
      setOtp("");
    } catch {
      setState({ step: "error", message: "Network error — please try again." });
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Verify Redemption</h1>
      <form onSubmit={handleVerify} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Customer&apos;s code
          <input
            type="text"
            inputMode="numeric"
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456"
            className="rounded border border-black/10 px-3 py-2 text-lg tracking-widest dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <button
          type="submit"
          disabled={state.step === "loading"}
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {state.step === "loading" ? "Verifying…" : "Verify"}
        </button>
      </form>
      {state.step === "success" && (
        <p className="text-sm text-green-600">Redeemed: {state.dealTitle}</p>
      )}
      {state.step === "error" && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}
    </main>
  );
}
