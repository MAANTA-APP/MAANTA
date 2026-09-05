"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LEAD_LOST_REASONS,
  LEAD_LOST_REASON_LABELS,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  type LeadStage,
} from "@/lib/growth/leads";

/**
 * Advance a lead, with the audit trail the move deserves.
 *
 * A select rather than drag-and-drop: the board is read on a phone in a mall
 * corridor as often as on a laptop, and a drag target that small is a mis-drop
 * waiting to happen — one that silently rewrites a lead's history.
 *
 * **Lost requires a reason**, from the closed list the database also enforces.
 * The UI asks first so the operator is not bounced by a constraint violation,
 * but the constraint is the real guard: "why did they say no" is the most
 * valuable thing cohort one produces, and free text cannot be counted.
 */
export function LeadStageActions({
  leadId,
  stage,
}: {
  leadId: string;
  stage: LeadStage;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pendingLost, setPendingLost] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(next: LeadStage, lostReason?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/growth/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: next, lostReason }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not move the lead.");
        setBusy(false);
        return;
      }
      setPendingLost(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(false);
  }

  if (pendingLost) {
    return (
      <div className="mt-2.5">
        <p className="mb-1.5 text-[11px] font-semibold text-ink">Why was it lost?</p>
        <div className="flex flex-wrap gap-1.5">
          {LEAD_LOST_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              disabled={busy}
              onClick={() => move("lost", reason)}
              className="rounded-pill border border-flame px-2.5 py-1 text-[11px] font-semibold text-flame hover:bg-flame-tint disabled:opacity-60"
            >
              {LEAD_LOST_REASON_LABELS[reason]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPendingLost(false)}
            className="rounded-pill border border-line px-2.5 py-1 text-[11px] font-semibold text-muted"
          >
            Cancel
          </button>
        </div>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <label className="sr-only" htmlFor={`stage-${leadId}`}>
        Move this lead to another stage
      </label>
      <select
        id={`stage-${leadId}`}
        value={stage}
        disabled={busy}
        onChange={(event) => {
          const next = event.target.value as LeadStage;
          if (next === stage) return;
          if (next === "lost") {
            setPendingLost(true);
            return;
          }
          void move(next);
        }}
        className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2 disabled:text-faint"
      >
        {LEAD_STAGES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}

/**
 * Rule 4: an error is carried by a border and a word, never by red body text.
 * The message stays #111 so it is legible in greyscale and to anyone who does
 * not separate red from grey.
 */
function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 border-l-2 border-flame pl-2 text-[11px] text-ink">{children}</p>
  );
}
