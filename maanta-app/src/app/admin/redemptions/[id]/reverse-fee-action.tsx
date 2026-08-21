"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlays";
import { TextField } from "@/components/ui/inputs";
import { formatKes } from "@/lib/ui";

/**
 * Fee-reversal action (frozen policy, Decisions Log 2026-07-22; decision note
 * made mandatory 2026-07-23). The single amber primary action on the redemption
 * detail screen: credit the reviewed fee back to the merchant's top-up wallet.
 * The confirmation modal captures an optional incident number and a REQUIRED
 * decision note for the audit trail — the confirm stays disabled until a
 * non-empty note is entered (the route and the RPC enforce the same rule). The
 * primary confirm inside the modal is the only other amber control, and it
 * replaces this one while the modal is open (never two amber actions at once).
 */
export function ReverseFeeAction({
  redemptionId,
  merchantName,
  fee,
}: {
  redemptionId: string;
  merchantName: string;
  fee: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [incidentRef, setIncidentRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/admin/redemptions/${redemptionId}/reverse-fee`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentRef, note }),
      }
    ).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      setError(body.error ?? "Could not reverse the fee. Please try again.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mt-6">
      {error && !open ? (
        <p className="mb-3 text-sm font-medium text-ink" role="alert">{error}</p>
      ) : null}

      <Button size="md" onClick={() => setOpen(true)}>
        Credit fee to merchant wallet
      </Button>

      <Modal open={open} onClose={() => (busy ? null : setOpen(false))}>
        <h2 className="text-lg font-bold text-ink">Reverse this success fee?</h2>
        <p className="mt-2 text-sm text-muted">
          {formatKes(fee)} is credited to {merchantName}&apos;s top-up wallet.
          The redemption and the original fee record are left unchanged — this
          is an additional wallet credit, logged for review.
        </p>

        <div className="mt-4 space-y-3">
          <TextField
            label="Incident number (optional)"
            value={incidentRef}
            onChange={(e) => setIncidentRef(e.target.value)}
            placeholder="e.g. 7"
          />
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Decision note <span className="font-semibold text-ink">*required</span>
            </span>
            <textarea
              className="min-h-[80px] w-full rounded-xl border border-ink/80 bg-white px-4 py-3 text-base text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why the merchant is in the right"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-3 text-sm font-medium text-ink" role="alert">{error}</p>
        ) : null}

        <Button
          full
          className="mt-4"
          onClick={submit}
          loading={busy}
          disabled={!note.trim()}
        >
          Credit {formatKes(fee)} to wallet
        </Button>
        <Button
          variant="ghost"
          full
          className="mt-3"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </Button>
      </Modal>
    </div>
  );
}
