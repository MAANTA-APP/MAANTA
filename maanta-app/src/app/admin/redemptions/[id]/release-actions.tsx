"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Guardian v1 held-redemption override (docs/maanta-guardian-v1.md §3).
 * Release → complete + apply the KES 30 fee; Reject → fail, no fee. Result
 * copy stays non-accusatory and in ink (frozen colour rules — errors are never
 * red body text).
 */
export function ReleaseActions({ redemptionId }: { redemptionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"release" | "reject" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function act(approve: boolean) {
    setBusy(approve ? "release" : "reject");
    setNote(null);
    try {
      const res = await fetch(`/api/admin/redemptions/${redemptionId}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(body.error ?? "Could not action this redemption.");
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
      <h2 className="text-sm font-bold text-ink">Release hold</h2>
      <div className="flex gap-2">
        <Button size="sm" loading={busy === "release"} onClick={() => act(true)}>
          Release &amp; charge fee
        </Button>
        <Button
          size="sm"
          variant="destructive-outline"
          loading={busy === "reject"}
          onClick={() => act(false)}
        >
          Reject
        </Button>
      </div>
      {note ? <p className="text-xs text-ink">{note}</p> : null}
    </div>
  );
}
