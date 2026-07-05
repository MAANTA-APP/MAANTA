"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ApproveButton({ merchantId }: { merchantId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/merchants/${merchantId}/approve`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not approve.");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleApprove}
        disabled={loading}
        className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
      >
        {loading ? "Approving…" : "Approve"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
