"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Guardian v1 hard-block appeal (docs/maanta-guardian-v1.md §3). A hard-blocked
 * redemption was declined at the counter with no fee moved. Approve → complete
 * it and charge the KES 30 fee; Uphold → keep it declined, no fee. Result copy
 * stays non-accusatory and in ink (frozen colour rules).
 */
export function AppealActions({ redemptionId }: { redemptionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function act(approve: boolean) {
    setBusy(approve ? "approve" : "reject");
    setNote(null);
    try {
      const res = await fetch(`/api/admin/redemptions/${redemptionId}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(body.error ?? "Could not action this appeal.");
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setNote("Could not reach the server. Try again.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="sm" loading={busy === "approve"} onClick={() => act(true)}>
          Approve &amp; complete
        </Button>
        <Button
          size="sm"
          variant="destructive-outline"
          loading={busy === "reject"}
          onClick={() => act(false)}
        >
          Uphold block
        </Button>
      </div>
      {note ? <p className="text-xs text-ink">{note}</p> : null}
    </div>
  );
}
