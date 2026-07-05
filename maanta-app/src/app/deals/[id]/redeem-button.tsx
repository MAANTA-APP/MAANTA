"use client";

import { useState } from "react";

type RedeemState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "success"; otpCode: string; expiresAt: string }
  | { step: "error"; message: string };

export default function RedeemButton({ dealId }: { dealId: string }) {
  const [state, setState] = useState<RedeemState>({ step: "idle" });

  function getLocation(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  }

  async function handleRedeem() {
    setState({ step: "loading" });
    try {
      const location = await getLocation();
      const res = await fetch("/api/redemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, lat: location?.lat, lng: location?.lng }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({
          step: "error",
          message: body.error ?? "Could not redeem this deal.",
        });
        return;
      }
      setState({
        step: "success",
        otpCode: body.otpCode,
        expiresAt: body.expiresAt,
      });
    } catch {
      setState({ step: "error", message: "Network error — please try again." });
    }
  }

  if (state.step === "success") {
    return (
      <div className="flex flex-col items-center gap-2 rounded border border-black/10 p-6 dark:border-white/20">
        <p className="text-sm text-black/60 dark:text-white/60">
          Show this code to the merchant staff:
        </p>
        <p className="text-4xl font-bold tracking-widest">{state.otpCode}</p>
        <p className="text-xs text-black/40 dark:text-white/40">
          Expires at {new Date(state.expiresAt).toLocaleTimeString()}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleRedeem}
        disabled={state.step === "loading"}
        className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {state.step === "loading" ? "Redeeming…" : "Redeem this deal"}
      </button>
      {state.step === "error" && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}
    </div>
  );
}
