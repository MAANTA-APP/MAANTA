"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** 11c Remove deal / Keep. Removal is a soft deactivate, audit-logged server-side. */
export function ModerationActions({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    // The DELETE previously swallowed failures — a deal that could not be
    // removed just stayed in the list, indistinguishable from success.
    try {
      const res = await fetch(`/api/admin/deals/${dealId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not remove the deal.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(false);
  }

  if (kept) {
    return <span className="text-xs font-semibold text-verified">Kept</span>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Button size="sm" variant="destructive-outline" loading={busy} onClick={remove}>
          Remove deal
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setKept(true)}>
          Keep
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
