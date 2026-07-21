"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Repost / Delete actions on an archived deal (10q). */
export function ArchivedActions({
  archiveId,
  reposted,
}: {
  archiveId: string;
  reposted: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"repost" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function repost() {
    setBusy("repost");
    setError(null);
    const res = await fetch("/api/deals/repost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archiveId }),
    });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Could not repost.");
      return;
    }
    router.push(`/merchant/deals/${body.dealId}`);
    router.refresh();
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    const res = await fetch(`/api/archive/${archiveId}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not delete.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3">
      {error ? <p className="mb-2 text-xs font-medium text-ink">{error}</p> : null}
      <div className="flex gap-2.5">
        <Button
          size="sm"
          className="flex-1"
          onClick={repost}
          loading={busy === "repost"}
          disabled={reposted}
        >
          Repost
        </Button>
        <Button
          size="sm"
          variant="destructive-outline"
          className="flex-1"
          onClick={remove}
          loading={busy === "delete"}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
