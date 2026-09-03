"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * 11f actions — Mark paid / Downgrade / Grant trial.
 *
 * `variant` rations the amber accent (frozen UI rule 1, D235) and applies only
 * to Grant trial, the one emphasised button here. On `/admin/billing` granting
 * a trial is the page's action, so it stays amber by default; composed onto
 * Merchant 360 it passes `"ghost"`, because that record page's single amber
 * belongs to Approve. Mark paid and Downgrade were already outline.
 */
export function PlanActions({
  merchantId,
  tier,
  onTrial,
  variant = "primary",
}: {
  merchantId: string;
  tier: "standard" | "elite";
  onTrial: boolean;
  variant?: "primary" | "ghost";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: string) {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/admin/plans/${merchantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <span className="text-xs text-ink" role="alert">{error}</span> : null}
      {onTrial ? (
        <>
          <Button size="sm" variant="ghost" loading={busy === "mark-paid"} onClick={() => act("mark-paid")}>
            Mark paid
          </Button>
          <Button size="sm" variant="ghost" loading={busy === "downgrade"} onClick={() => act("downgrade")}>
            Downgrade
          </Button>
        </>
      ) : tier === "elite" ? (
        <Button size="sm" variant="ghost" loading={busy === "downgrade"} onClick={() => act("downgrade")}>
          Downgrade
        </Button>
      ) : (
        <Button size="sm" variant={variant} loading={busy === "grant-trial"} onClick={() => act("grant-trial")}>
          Grant trial
        </Button>
      )}
    </div>
  );
}
