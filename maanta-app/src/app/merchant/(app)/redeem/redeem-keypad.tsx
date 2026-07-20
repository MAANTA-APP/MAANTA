"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NumericKeypad } from "@/components/ui/inputs";
import { Button } from "@/components/ui/button";
import { FeeDisclosure } from "@/components/ui/fee-disclosure";
import { InlineAlert } from "@/components/ui/inline-alert";
import { IconCheck, IconX } from "@/components/ui/icons";
import { cn, formatKes } from "@/lib/ui";
import Link from "next/link";

/**
 * Merchant redeem — strict two-step resolve-then-charge (brief §8, L10):
 *   1. entering the 6-digit code RESOLVES it (preflight) — charges nothing.
 *   2. FeeDisclosure shows the exact fee before any charge.
 *   3. an explicit "Confirm redemption" is the only thing that charges.
 * A one-tap verify would hide the fee, so verify never charges here.
 */
type Screen =
  | { kind: "keypad" }
  | { kind: "checking" }
  | {
      kind: "disclose";
      code: string;
      dealTitle: string | null;
      mismatch: boolean;
      distance: number | null;
    }
  | { kind: "verifying" }
  | {
      kind: "success";
      newBalance: number | null;
      feeAmount: number;
      feeChargeStatus: "charged" | "owed" | "unknown";
      disputed: boolean;
    }
  | { kind: "rejected"; reason: string; noFee: boolean };

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

  // Entering 6 digits RESOLVES the code (charges nothing).
  useEffect(() => {
    if (code.length === 6 && screen.kind === "keypad" && !submitting.current) {
      void resolveCode(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Success auto-returns to a fresh keypad.
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

  // Step 1 — resolve only. Never charges. Ends on the FeeDisclosure screen.
  async function resolveCode(otpCode: string) {
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
      setScreen({
        kind: "disclose",
        code: otpCode,
        dealTitle: body.dealTitle ?? null,
        mismatch: body.locationMismatch === true,
        distance: typeof body.distanceMeters === "number" ? body.distanceMeters : null,
      });
    } catch {
      setScreen({ kind: "rejected", reason: "Network error — try again", noFee: true });
    }
  }

  // Step 3 — charge. Only ever called from an explicit Confirm on the disclosure.
  async function confirmRedemption(otpCode: string, override?: { reason: string }) {
    setScreen({ kind: "verifying" });
    try {
      const res = await fetch("/api/redemptions/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          override
            ? { otpCode, override: true, overrideReason: override.reason }
            : { otpCode }
        ),
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
        feeChargeStatus:
          body.feeChargeStatus === "charged" ||
          body.feeChargeStatus === "owed" ||
          body.feeChargeStatus === "unknown"
            ? body.feeChargeStatus
            : "charged",
        disputed: body.disputed === true,
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

  // Verify-anyway (frozen rule, G1): a low or empty wallet NEVER blocks
  // verification. The keypad stays live at any balance; an underfunded fee is
  // recorded as arrears inside verify_redemption and settled at the next
  // top-up. (Only new-deal creation is gated on balance, server-side.)

  // Success — flat, neutral confirmation. No confetti, no shadow, no emoji.
  if (screen.kind === "success") {
    return (
      <main className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-verified-tint">
          <IconCheck className="h-8 w-8 text-verified" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">Verified</h1>
        {screen.feeChargeStatus === "owed" ? (
          <>
            <p className="tnum mt-2 text-sm text-secondary">
              {formatKes(screen.feeAmount)} success fee recorded as arrears
            </p>
            <p className="mt-1 text-sm text-secondary">
              Settled from your next top-up.
            </p>
          </>
        ) : (
          <>
            <p className="tnum mt-2 text-sm text-secondary">
              {formatKes(screen.feeAmount)} success fee charged
            </p>
            {screen.newBalance != null ? (
              <p className="tnum mt-1 text-sm font-semibold text-ink">
                Wallet balance {formatKes(screen.newBalance)}
              </p>
            ) : null}
          </>
        )}
        {screen.disputed ? (
          <InlineAlert variant="warning" className="mt-4 text-left">
            This redemption was flagged and sent to MAANTA for review.
          </InlineAlert>
        ) : null}
        <p className="mt-4 text-xs text-muted">Resetting in {countdown}…</p>
      </main>
    );
  }

  // Failure is DARK, not red (brief §8 / anti-patterns). Icon + word. No emoji.
  if (screen.kind === "rejected") {
    return (
      <main className="flex min-h-[70dvh] flex-col items-center justify-center bg-ink-900 px-6 py-20 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] border-white/40">
          <IconX className="h-8 w-8 text-white" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-white">Code not valid</h1>
        <p className="mt-2 text-sm text-white/70">{screen.reason}</p>
        {screen.noFee ? (
          <p className="mt-1 text-sm font-semibold text-white">No fee was charged</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-8 h-12 w-full max-w-xs rounded-full border border-white/50 text-base font-semibold text-white"
        >
          Try another code
        </button>
      </main>
    );
  }

  // Step 2 — FeeDisclosure. Resolved, not charged. The fee is shown before Confirm.
  if (screen.kind === "disclose") {
    return (
      <main className="flex flex-col px-5 pt-5">
        <p className="text-xs font-medium text-muted">Code resolved</p>
        {screen.dealTitle ? (
          <h1 className="mt-1 text-lg font-bold text-ink">{screen.dealTitle}</h1>
        ) : null}

        {screen.mismatch ? (
          <InlineAlert variant="warning" title="Claimed away from your shop." className="mt-3">
            Confirm only if the customer is standing at your counter
            {screen.distance != null ? ` (${Math.round(screen.distance)}m away)` : ""}.
          </InlineAlert>
        ) : null}

        <FeeDisclosure fee={fee} balance={balance} className="mt-4" />

        <div className="mt-6 space-y-3">
          {/* Verify-anyway (G1): Confirm is NEVER disabled by wallet state.
              An underfunded fee is recorded as arrears (disclosed above), so
              the single amber action is always Confirm — never a forced Top up. */}
          <Button
            full
            onClick={() =>
              confirmRedemption(
                screen.code,
                screen.mismatch
                  ? {
                      reason:
                        screen.distance != null
                          ? `Location mismatch (${Math.round(screen.distance)}m from shop) — merchant confirmed customer at counter`
                          : "Location mismatch — merchant confirmed customer at counter",
                    }
                  : undefined
              )
            }
          >
            Confirm redemption — {formatKes(fee)} fee
          </Button>
          <Button variant="ghost" full onClick={() => reject(screen.code)}>
            Reject code
          </Button>
          <button
            type="button"
            onClick={reset}
            className="mx-auto block py-1 text-sm font-semibold text-ink underline-offset-2 hover:underline"
          >
            Cancel
          </button>
        </div>
      </main>
    );
  }

  // Charging in flight.
  if (screen.kind === "verifying") {
    return (
      <main className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
        <span
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-ink"
        />
        <p className="mt-5 text-sm font-semibold text-ink">Confirming…</p>
      </main>
    );
  }

  // Keypad (default) — entering a code resolves it. Charges nothing.
  const checking = screen.kind === "checking";
  return (
    <main className="flex flex-col px-5 pt-4">
      {insufficient ? (
        <InlineAlert variant="warning" title="Wallet below the fee." className="mb-3">
          Verifications still work — each {formatKes(fee)} fee is recorded as
          arrears and settled from your next{" "}
          <Link href="/merchant/topup" className="font-semibold text-ink underline">
            top-up
          </Link>
          .
        </InlineAlert>
      ) : low ? (
        <InlineAlert variant="warning" title="Balance is low." className="mb-3">
          Enough for about {remaining} more redemption{remaining === 1 ? "" : "s"}.{" "}
          <Link href="/merchant/topup" className="font-semibold text-ink underline">
            Top up
          </Link>{" "}
          to avoid interruption.
        </InlineAlert>
      ) : null}

      <p className="mt-2 text-center text-xs font-medium text-muted">
        Enter the customer&apos;s 6-digit code
      </p>

      <div className="mt-4 flex justify-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex h-14 w-11 items-center justify-center rounded-xl border bg-white font-code text-xl font-semibold",
              i === code.length ? "border-2 border-ink" : code[i] ? "border-ink/80" : "border-line"
            )}
          >
            {code[i] ?? ""}
          </div>
        ))}
      </div>

      {checking ? (
        <p className="mt-4 text-center text-sm font-semibold text-ink">Checking…</p>
      ) : null}

      <div className="mt-8">
        <NumericKeypad
          disabled={checking}
          onDigit={(d) => setCode((c) => (c.length < 6 ? c + d : c))}
          onDelete={() => setCode((c) => c.slice(0, -1))}
        />
      </div>
    </main>
  );
}
