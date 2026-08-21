"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlays";
import { CheckboxRow } from "@/components/ui/inputs";
import { W3wChip } from "@/components/ui/chips";
import { IconCheck } from "@/components/ui/icons";
import { InlineAlert } from "@/components/ui/inline-alert";
import {
  approveOutcomeMessage,
  formatEliteTrialCapLine,
  type EliteTrialCapStatus,
  type EliteTrialOutcome,
} from "@/lib/elite-trial";

/** 11b actions + 11j approve confirmation modal + ops actions row. */
export function MerchantAdminActions({
  merchantId,
  merchantName,
  status,
  node,
  w3w,
  floorUnit,
  isFeatured,
  isShadowBanned,
  trialCap = null,
}: {
  merchantId: string;
  merchantName: string;
  status: string;
  node: string;
  w3w: string;
  floorUnit: string;
  isFeatured: boolean;
  isShadowBanned: boolean;
  /** Launch-offer slots from elite_trial_cap_status(); null if the RPC failed. */
  trialCap?: EliteTrialCapStatus | null;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [grantTrial, setGrantTrial] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const capExhausted = trialCap != null && trialCap.remaining <= 0;
  const capLine = trialCap ? formatEliteTrialCapLine(trialCap) : null;

  async function approve() {
    setBusy("approve");
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/merchants/${merchantId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantEliteTrial: grantTrial }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Could not approve.");
      return;
    }
    setNotice(
      approveOutcomeMessage({
        grantRequested: grantTrial,
        eliteTrialGranted: body.eliteTrialGranted === true,
        eliteTrialOutcome: body.eliteTrialOutcome as EliteTrialOutcome | null | undefined,
        notice: typeof body.notice === "string" ? body.notice : null,
      })
    );
    setModalOpen(false);
    router.refresh();
  }

  async function ops(action: string) {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/admin/merchants/${merchantId}/ops`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Action failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6">
      {error ? <p className="mb-3 text-sm font-medium text-ink" role="alert">{error}</p> : null}
      {notice ? (
        <InlineAlert variant="warning" className="mb-3" title={notice} />
      ) : null}

      {status === "pending" ? (
        <div className="space-y-3">
          {capLine ? (
            <p className="text-xs text-muted" data-testid="elite-trial-cap-line">
              {capLine}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="md" onClick={() => setModalOpen(true)}>
              Approve
            </Button>
            <Button
              size="md"
              variant="ghost"
              loading={busy === "reject"}
              onClick={() => ops("reject")}
            >
              Reject
            </Button>
            <CheckboxRow
              label="Grant Elite trial (30 days)"
              checked={grantTrial}
              onChange={setGrantTrial}
            />
          </div>
          {grantTrial && capExhausted ? (
            <InlineAlert variant="warning" title="Offer fully claimed.">
              Ticking the box will still approve the shop, but on Standard — no trial will be granted.
            </InlineAlert>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <span className="text-xs font-semibold text-muted">Ops actions:</span>
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "suspend" || busy === "reactivate"}
          onClick={() => ops(status === "suspended" ? "reactivate" : "suspend")}
        >
          {status === "suspended" ? "Reinstate" : "Suspend"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "feature" || busy === "unfeature"}
          onClick={() => ops(isFeatured ? "unfeature" : "feature")}
        >
          {isFeatured ? "Unfeature" : "Feature"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "shadow-ban" || busy === "unban"}
          onClick={() => ops(isShadowBanned ? "unban" : "shadow-ban")}
        >
          {isShadowBanned ? "Lift shadow-ban" : "Shadow-ban"}
        </Button>
      </div>

      {/* 11j Approve confirmation */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <h2 className="text-lg font-bold text-ink">Approve {merchantName}?</h2>
        <p className="mt-2 text-sm text-muted">
          The shop goes live at {node} immediately and the owner is notified by SMS.
        </p>
        <p className="mt-4 flex flex-wrap items-center gap-2 rounded-card bg-cream px-3 py-2.5 text-sm text-ink">
          <IconCheck className="h-4 w-4 text-verified" />
          <W3wChip address={w3w} />
          {floorUnit ? <span className="text-muted">· {floorUnit}</span> : null}
        </p>
        {capLine ? (
          <p className="mt-3 text-xs text-muted" data-testid="elite-trial-cap-line-modal">
            {capLine}
          </p>
        ) : null}
        <div className="mt-2">
          <CheckboxRow
            label="Grant Elite trial (30 days)"
            checked={grantTrial}
            onChange={setGrantTrial}
          />
        </div>
        {grantTrial && capExhausted ? (
          <InlineAlert variant="warning" title="Offer fully claimed." className="mt-2">
            Confirming will activate on Standard. The trial box is a request, not a guarantee once the first 100 slots are gone.
          </InlineAlert>
        ) : null}
        {error ? <p className="mt-2 text-sm font-medium text-ink" role="alert">{error}</p> : null}
        <Button full className="mt-4" onClick={approve} loading={busy === "approve"}>
          Confirm approval
        </Button>
        <Button variant="ghost" full className="mt-3" onClick={() => setModalOpen(false)}>
          Cancel
        </Button>
      </Modal>
    </div>
  );
}
