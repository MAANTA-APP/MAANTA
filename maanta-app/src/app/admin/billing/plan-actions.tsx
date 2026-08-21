"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** 11f actions — Mark paid / Downgrade / Grant trial. */
export function PlanActions({
  merchantId,
  tier,
  onTrial,
}: {
  merchantId: string;
  tier: "standard" | "elite";
  onTrial: boolean;
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
        <Button size="sm" loading={busy === "grant-trial"} onClick={() => act("grant-trial")}>
          Grant trial
        </Button>
      )}
    </div>
  );
}
