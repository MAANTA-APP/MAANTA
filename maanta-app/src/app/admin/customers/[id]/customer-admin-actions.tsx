"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";

/**
 * D171 — the shopper block, as an operable control.
 *
 * The console showed a Blacklisted/Active chip for a flag nothing could set and
 * nothing acted on. This is the control half; the meaning half is in the
 * database (`claim_deal` raises `user_blacklisted`).
 *
 * The copy states the exact boundary, because an admin acting on a live pilot
 * needs to know what will and will not happen. Blocking new claims is not the
 * same as cancelling the code someone is already holding, and an admin who
 * assumes otherwise would tell a merchant the wrong thing at a counter.
 */
export function CustomerAdminActions({
  userId,
  isBlacklisted,
}: {
  userId: string;
  isBlacklisted: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: "blacklist" | "unblacklist") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/customers/${userId}/ops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The route's refusals are specific (own account, non-shopper role);
        // showing its sentence beats a generic failure line.
        setError(json?.error ?? "Could not complete that action.");
        return;
      }
      setNotice(
        action === "blacklist"
          ? "Blocked. This shopper cannot claim any new deals."
          : "Unblocked. This shopper can claim deals again."
      );
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-card bg-white p-4 shadow-card">
      <h2 className="text-sm font-bold text-ink">Shopper access</h2>
      <p className="mt-1 text-xs text-muted">
        {isBlacklisted
          ? "This shopper is blocked and cannot claim new deals. Codes they already hold still work at the counter."
          : "Blocking stops this shopper claiming new deals. Codes they already hold still work at the counter, and merchants are still paid for those."}
      </p>

      {error ? (
        <div className="mt-3">
          <InlineAlert variant="error">{error}</InlineAlert>
        </div>
      ) : null}
      {notice ? (
        <div className="mt-3">
          <InlineAlert variant="info">{notice}</InlineAlert>
        </div>
      ) : null}

      <div className="mt-3">
        <Button
          variant={isBlacklisted ? "ghost" : "destructive-outline"}
          disabled={busy}
          onClick={() => run(isBlacklisted ? "unblacklist" : "blacklist")}
        >
          {busy
            ? "Working…"
            : isBlacklisted
              ? "Unblock this shopper"
              : "Block new claims"}
        </Button>
      </div>
    </div>
  );
}
