"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NumericKeypad } from "@/components/ui/inputs";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconCheck, IconX } from "@/components/ui/icons";
import { cn, formatKes } from "@/lib/ui";

type Screen =
  | { kind: "keypad" }
  | { kind: "checking" }
  | { kind: "mismatch"; code: string; distance: number | null }
  | { kind: "verifying" }
  | { kind: "success"; newBalance: number | null; feeAmount: number }
  | { kind: "rejected"; reason: string; noFee: boolean };

/** 9k keypad + 9l success (resets in 3s) + 9m rejected + 9t mismatch + 10l/10m wallet gates. */
export function RedeemKeypad({
  balance: initialBalance,
  fee,
  canVerify,
}: {
  balance: number;
  fee: number;
  canVerify: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [screen, setScreen] = useState<Screen>({ kind: "keypad" });
  const [balance, setBalance] = useState(initialBalance);
  const [countdown, setCountdown] = useState(3);
  const submitting = useRef(false);

  const insufficient = balance < fee;
  const low = !insufficient && balance <= fee * 3;
  const remaining = Math.floor(balance / fee);

  // Auto-submit when 6 digits are in.
  useEffect(() => {
    if (code.length === 6 && screen.kind === "keypad" && !submitting.current) {
      void preflight(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // 9l: "Resetting in 3…"
  useEffect(() => {
    if (screen.kind !== "success") return;
    setCountdown(3);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          reset();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.kind]);

  function reset() {
    setCode("");
    submitting.current = false;
    setScreen({ kind: "keypad" });
    router.refresh();
  }

  async function preflight(otpCode: string) {
    submitting.current = true;
    setScreen({ kind: "checking" });
    try {
      const res = await fetch("/api/redemptions/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpCode }),
      });
      const body = await res.json();
      if (!res.ok) {
        setScreen({ kind: "rejected", reason: body.error ?? "Try again", noFee: true });
        return;
      }
      if (!body.found) {
        setScreen({ kind: "rejected", reason: "Invalid or already-used code", noFee: true });
        return;
      }
      if (body.expired) {
        setScreen({ kind: "rejected", reason: "Expired past grace period", noFee: true });
        return;
      }
      if (body.locationMismatch) {
        setScreen({ kind: "mismatch", code: otpCode, distance: body.distanceMeters });
        return;
      }
      await verify(otpCode);
    } catch {
      setScreen({ kind: "rejected", reason: "Network error — try again", noFee: true });
    }
  }

  async function verify(otpCode: string) {
    setScreen({ kind: "verifying" });
    try {
      const res = await fetch("/api/redemptions/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpCode }),
      });
      const body = await res.json();
      if (!res.ok) {
        setScreen({ kind: "rejected", reason: body.error ?? "Could not verify", noFee: true });
        return;
      }
      if (typeof body.newBalance === "number") setBalance(body.newBalance);
      setScreen({
        kind: "success",
        newBalance: typeof body.newBalance === "number" ? body.newBalance : null,
        feeAmount: typeof body.feeAmount === "number" ? body.feeAmount : fee,
      });
    } catch {
      setScreen({ kind: "rejected", reason: "Network error — try again", noFee: true });
    }
  }

  async function reject(otpCode: string) {
    await fetch("/api/redemptions/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otpCode }),
    }).catch(() => null);
    reset();
  }

  if (!canVerify) {
    return (
      <main className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-sm font-semibold text-ink">
          You don&apos;t have permission to verify codes.
        </p>
        <p className="mt-1 text-xs text-muted">Ask the shop owner to enable it in Staff.</p>
      </main>
    );
  }

  // 10m Insufficient-wallet block (<fee)
  if (insufficient && screen.kind === "keypad") {
    return (
      <main className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-flame-tint text-2xl">
          🛑
        </span>
        <h1 className="mt-5 text-xl font-bold text-ink">Wallet balance too low</h1>
        <p className="mt-2 text-sm text-muted">
          You need at least {formatKes(fee)} to verify a redemption
        </p>
        <ButtonLink href="/merchant/topup" full className="mt-8">
          Top up wallet
        </ButtonLink>
      </main>
    );
  }

  if (screen.kind === "success") {
    return (
      <main className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-verified-tint">
          <IconCheck className="h-8 w-8 text-verified" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">Verified</h1>
        <p className="mt-2 text-sm text-muted">
          {formatKes(screen.feeAmount)} success fee applied
        </p>
        {screen.newBalance != null ? (
          <p className="mt-1 text-sm font-semibold text-ink">
            New balance: {formatKes(screen.newBalance)}
          </p>
        ) : null}
        <p className="mt-4 text-xs text-faint">Resetting in {countdown}…</p>
      </main>
    );
  }

  if (screen.kind === "rejected") {
    return (
      <main className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-flame-tint">
          <IconX className="h-8 w-8 text-flame" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">Code not valid</h1>
        <p className="mt-2 text-sm text-muted">{screen.reason}</p>
        {screen.noFee ? (
          <p className="mt-1 text-sm font-semibold text-ink">No fee was charged</p>
        ) : null}
        <Button variant="ghost" full className="mt-8" onClick={reset}>
          Try another code
        </Button>
      </main>
    );
  }

  if (screen.kind === "mismatch") {
    // 9t Verify — location mismatch warning
    return (
      <main className="px-5 pt-6">
        <div className="rounded-2xl bg-cream px-6 py-5 text-center font-mono text-3xl font-bold tracking-[0.12em]">
          {screen.code.slice(0, 3)} {screen.code.slice(3)}
        </div>
        <div className="mt-4 rounded-card border border-flame/40 bg-flame-tint p-4">
          <p className="text-sm font-bold text-flame">⚠️ Location check failed</p>
          <p className="mt-1 text-sm text-ink">
            This code was claimed away from your shop. Verify only if the customer is
            standing at your counter.
          </p>
        </div>
        <Button full className="mt-6" onClick={() => verify(screen.code)}>
          Verify anyway — {formatKes(fee)} fee
        </Button>
        <Button variant="ghost" full className="mt-3" onClick={() => reject(screen.code)}>
          Reject code
        </Button>
      </main>
    );
  }

  const busy = screen.kind === "checking" || screen.kind === "verifying";

  return (
    <main className="flex flex-col px-5 pt-4">
      {low ? (
        <Link
          href="/merchant/topup"
          className="mb-3 block rounded-card border border-flame/40 bg-flame-tint px-4 py-3 text-sm text-ink"
        >
          Your balance is low — only {remaining} more redemption
          {remaining === 1 ? "" : "s"} can be verified.{" "}
          <span className="font-semibold underline">Top up now</span>
        </Link>
      ) : null}

      <p className="mt-2 text-center text-xs font-medium text-muted">
        Enter the customer&apos;s 6-digit code
      </p>

      <div className="mt-4 flex justify-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex h-14 w-11 items-center justify-center rounded-xl border bg-white font-mono text-xl font-semibold",
              i === code.length ? "border-2 border-ink" : code[i] ? "border-ink/80" : "border-line"
            )}
          >
            {code[i] ?? ""}
          </div>
        ))}
      </div>

      {busy ? (
        <p className="mt-4 text-center text-sm font-semibold text-ink">
          {screen.kind === "checking" ? "Checking…" : "⏳ Verifying…"}
        </p>
      ) : null}

      <div className="mt-8">
        <NumericKeypad
          disabled={busy}
          onDigit={(d) => setCode((c) => (c.length < 6 ? c + d : c))}
          onDelete={() => setCode((c) => c.slice(0, -1))}
        />
      </div>
    </main>
  );
}
