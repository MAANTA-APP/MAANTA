"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Complete a support task with an audit line.
 *
 * `variant` exists only to ration the amber accent (frozen UI rule 1, D235).
 * On `/admin/support` this IS the page's action, so it stays amber by default.
 * Composed onto Merchant 360 it sits beside Suspend, Reject and Downgrade on a
 * record page whose one amber belongs to Approve, so that caller passes
 * `"ghost"`. Behaviour, authorization and the route called are identical
 * either way — this is emphasis, nothing else.
 */
export function OverrideButton({
  taskId,
  variant = "primary",
}: {
  taskId: string;
  variant?: "primary" | "ghost";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function override() {
    setBusy(true);
    setError(null);
    // An override that failed used to look exactly like one that landed.
    try {
      const res = await fetch(`/api/admin/support/${taskId}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not apply the override.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-1.5">
      <Button size="sm" variant={variant} loading={busy} onClick={override}>
        Override (audit-trailed)
      </Button>
      {error ? (
        <p className="text-xs text-ink" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
