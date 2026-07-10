"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Approve / Reject on a fraud event (11d). */
export function FraudActions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function act(action: "approve" | "reject") {
    setBusy(action);
    await fetch(`/api/admin/fraud/${eventId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" loading={busy === "approve"} onClick={() => act("approve")}>
        Approve
      </Button>
      <Button size="sm" variant="ghost" loading={busy === "reject"} onClick={() => act("reject")}>
        Reject
      </Button>
    </div>
  );
}
