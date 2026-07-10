"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** 11c Remove deal / Keep. */
export function ModerationActions({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState(false);

  async function remove() {
    setBusy(true);
    await fetch(`/api/admin/deals/${dealId}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    router.refresh();
  }

  if (kept) {
    return <span className="text-xs font-semibold text-verified">Kept</span>;
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="destructive-outline" loading={busy} onClick={remove}>
        Remove deal
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setKept(true)}>
        Keep
      </Button>
    </div>
  );
}
