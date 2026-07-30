"use client";

import { useEffect, useState } from "react";
import { formatCode, msUntil } from "@/lib/ui";
import { DEAL_GRACE_MINUTES } from "@/lib/deal-expiry";

/**
 * S5 — the claimed-code hero. The single most important screen in the product:
 * it *is* the credential a dispute is argued from, so it has ZERO amber actions.
 *
 * - The code lives inside a white card whose border breathes amber (R3); the
 *   code is never on an amber fill.
 * - The countdown ticks live every second — a frozen timer means a screenshot,
 *   which is the anti-screenshot device the counter copy relies on. It counts to
 *   the code's absolute expiry (deal end + grace), never a fixed span from the
 *   moment of claim (R-GRACE).
 * - Once the deal itself has ended, the card switches to the grace-period state:
 *   the code is still honourable for DEAL_GRACE_MINUTES, and the counter needs to
 *   see that in a word, not infer it from a small number (L12 — never colour
 *   alone).
 * - Slashed-zero, tabular mono so a cashier never misreads it.
 */
function mmss(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ClaimedCode({
  code,
  expiresAt,
  dealEndsAt,
}: {
  code: string;
  /** Code expiry — deal end plus the grace period. */
  expiresAt: string;
  /** The deal's own end. Null for a legacy claim with no deal expiry recorded. */
  dealEndsAt?: string | null;
}) {
  const [left, setLeft] = useState(() => msUntil(expiresAt));
  const [dealLeft, setDealLeft] = useState(() =>
    dealEndsAt ? msUntil(dealEndsAt) : Infinity
  );
  useEffect(() => {
    const t = setInterval(() => {
      setLeft(msUntil(expiresAt));
      setDealLeft(dealEndsAt ? msUntil(dealEndsAt) : Infinity);
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, dealEndsAt]);

  const expired = left <= 0;
  const inGrace = !expired && dealLeft <= 0;

  return (
    <div
      className="w-full animate-r3 rounded-2xl border-[2.5px] border-brand bg-white px-5 py-6"
      role="group"
      aria-label="Redemption code"
    >
      <div className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        For the shop
      </div>
      <div className="font-code mt-2 text-center text-[30px] font-medium tracking-[0.14em] text-ink">
        {formatCode(code)}
      </div>
      <div className="mt-3 flex flex-col items-center gap-0.5">
        <div className="font-code text-xl font-semibold text-ink" aria-live="off">
          {expired ? "0:00" : mmss(left)}
        </div>
        {/* The state is always carried by a word, never by the number alone. */}
        <div className="text-xs text-muted">
          {expired
            ? "this code has expired"
            : inGrace
              ? `grace period — still valid for ${DEAL_GRACE_MINUTES} minutes after the deal ends`
              : "until this code expires"}
        </div>
      </div>
    </div>
  );
}
