"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Approve / Reject on a fraud event (11d). */
export function FraudActions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    // A swallowed failure here looked identical to a resolved event — the row
    // just stayed put with no explanation. Failures now say so.
    try {
      const res = await fetch(`/api/admin/fraud/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not action this event.");
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(null);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Button size="sm" loading={busy === "approve"} onClick={() => act("approve")}>
          Approve
        </Button>
        <Button size="sm" variant="ghost" loading={busy === "reject"} onClick={() => act("reject")}>
          Reject
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-ink" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
