"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/inputs";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ESCALATION_ORIGINS, INTAKE_CHANNELS } from "@/lib/support-intake";

type MerchantOption = { id: string; name: string };

/** Mirrors the agent_tasks CHECK; labels are the queue's own vocabulary. */
const TASK_TYPES = [
  { value: "audit", label: "Audit" },
  { value: "dispute_review", label: "Dispute review" },
  { value: "fraud_review", label: "Fraud review" },
  { value: "onboarding_followup", label: "Onboarding follow-up" },
  { value: "retraining", label: "Retraining" },
  { value: "suspension_review", label: "Suspension review" },
];

const PRIORITIES = ["low", "normal", "high", "critical"];

const selectClass = inputClass;

export function NewTicketForm({
  merchants,
  initialMerchantId = "",
}: {
  merchants: MerchantOption[];
  /** Pre-selected merchant when the form is opened from a Merchant 360 view. */
  initialMerchantId?: string;
}) {
  const router = useRouter();
  const [merchantId, setMerchantId] = useState(initialMerchantId);
  const [taskType, setTaskType] = useState("");
  const [priority, setPriority] = useState("normal");
  const [channel, setChannel] = useState("");
  const [origin, setOrigin] = useState("direct");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = (label: string, control: React.ReactNode) => (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="mt-1.5">{control}</div>
    </label>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId, taskType, priority, channel, origin, description }),
    }).catch(() => null);

    if (res?.ok) {
      // Land on the open queue with the new ticket at the top — proof it exists
      // beats a success takeover for an operator surface.
      router.push("/admin/support");
      router.refresh();
      return;
    }
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error ?? "Could not create the ticket. Try again.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-5 max-w-xl space-y-4">
      {field(
        "Merchant",
        <select
          required
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          className={selectClass}
        >
          <option value="">Select the merchant this is about…</option>
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          "Issue type",
          <select
            required
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            className={selectClass}
          >
            <option value="">Select…</option>
            {TASK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        {field(
          "Priority",
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={selectClass}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          "How it reached you",
          <select
            required
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className={selectClass}
          >
            <option value="">Select…</option>
            {INTAKE_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        {field(
          "Escalation",
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className={selectClass}
          >
            {ESCALATION_ORIGINS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {field(
        "What happened",
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className={`${selectClass} min-h-[6rem] py-2.5`}
          placeholder="Short and literal — what was reported, by whom, and what they expect."
        />
      )}

      {error ? <InlineAlert variant="error" title={error} /> : null}

      {/* The one amber action on this screen. */}
      <Button type="submit" loading={busy} full>
        Create ticket
      </Button>
    </form>
  );
}
