"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function OverrideButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function override() {
    setBusy(true);
    await fetch(`/api/admin/support/${taskId}`, { method: "POST" }).catch(() => null);
    setBusy(false);
    router.refresh();
  }

  return (
    <Button size="sm" loading={busy} onClick={override}>
      Override (audit-trailed)
    </Button>
  );
}
