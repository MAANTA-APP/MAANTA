"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Candidate = { id: string; merchant_name: string; status: string };

/**
 * G4 lead→merchant linkage tool. Lets the agent pick one of the shops they
 * onboarded and tie this lead to it (single amber "Link to merchant" action).
 */
export function LinkMerchant({
  leadId,
  candidates,
}: {
  leadId: string;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId: selected }),
      });
      const body = await res.json();
      setBusy(false);
      if (!res.ok) {
        setError(body.error ?? "Could not link the lead.");
        return;
      }
      router.refresh();
    } catch {
      setBusy(false);
      setError("Network error — try again.");
    }
  }

  return (
    <section className="mt-6">
      <h2 className="text-base font-bold text-ink">Link to merchant</h2>
      {candidates.length === 0 ? (
        <p className="mt-2 rounded-card border border-line bg-white px-4 py-4 text-sm text-muted">
          No unlinked shops you onboarded yet. Onboard this shop first, then link it here.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            Pick a shop you onboarded to record this lead as converted.
          </p>
          <div className="mt-3 space-y-2">
            {candidates.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelected(m.id)}
                // The selection dot is aria-hidden — without this, which shop
                // is picked is visual-only.
                aria-pressed={selected === m.id}
                className={
                  "flex w-full items-center justify-between rounded-card border px-4 py-3 text-left " +
                  (selected === m.id
                    ? "border-ink bg-cream"
                    : "border-line bg-white hover:bg-cream/50")
                }
              >
                <span className="text-sm font-semibold text-ink">{m.merchant_name}</span>
                <span
                  aria-hidden
                  className={
                    "h-4 w-4 rounded-full border-[1.5px] " +
                    (selected === m.id ? "border-ink bg-ink" : "border-muted bg-white")
                  }
                />
              </button>
            ))}
          </div>

          {error ? (
            <p className="mt-3 text-sm font-medium text-ink" role="alert">
              {error}
            </p>
          ) : null}

          <Button
            full
            className="mt-4"
            onClick={link}
            loading={busy}
            disabled={!selected}
          >
            Link to merchant
          </Button>
        </>
      )}
    </section>
  );
}
