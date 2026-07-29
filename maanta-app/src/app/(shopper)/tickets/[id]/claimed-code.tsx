"use client";

import { useEffect, useState } from "react";
import { formatCode, msUntil } from "@/lib/ui";

/**
 * S5 — the claimed-code hero. The single most important screen in the product:
 * it *is* the credential a dispute is argued from, so it has ZERO amber actions.
 *
 * - The code lives inside a white card whose border breathes amber (R3); the
 *   code is never on an amber fill.
 * - The countdown ticks live every second — a frozen timer means a screenshot,
 *   which is the anti-screenshot device the counter copy relies on.
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
}: {
  code: string;
  expiresAt: string;
}) {
  const [left, setLeft] = useState(() => msUntil(expiresAt));
  useEffect(() => {
    const t = setInterval(() => setLeft(msUntil(expiresAt)), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const expired = left <= 0;

  return (
    <div
      className="w-full animate-r3 rounded-2xl border-[2.5px] border-brand bg-white px-5 py-6"
      role="group"
      aria-label="Redemption code"
    >
      <div className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        Show this code
      </div>
      <div className="font-code mt-2 text-center text-[30px] font-medium tracking-[0.14em] text-ink">
        {formatCode(code)}
      </div>
      <div className="mt-3 flex flex-col items-center gap-0.5">
        <div className="font-code text-xl font-semibold text-ink" aria-live="off">
          {expired ? "0:00" : mmss(left)}
        </div>
        <div className="text-xs text-muted">
          {expired ? "this code has expired" : "until this code expires"}
        </div>
      </div>
    </div>
  );
}
