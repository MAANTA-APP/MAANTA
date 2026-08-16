"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextField, inputClass } from "@/components/ui/inputs";
import { InlineAlert } from "@/components/ui/inline-alert";
import { NODES } from "@/lib/nodes";

export type Candidate = { id: string; label: string; sub: string };

/**
 * Admin-assisted onboarding form.
 *
 * One amber action (Create shop). Errors are the persistent `error` InlineAlert,
 * never a toast — this writes a merchant row and promotes a person's account.
 */
export function AdminOnboardForm({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/merchants/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          merchantName: formData.get("merchantName"),
          phone: formData.get("phone"),
          email: formData.get("email"),
          whatsapp: formData.get("whatsapp"),
          node: formData.get("node"),
          what3wordsAddress: formData.get("what3wordsAddress"),
          floor: formData.get("floor"),
          unitNumber: formData.get("unitNumber"),
          entranceNotes: formData.get("entranceNotes"),
        }),
      });
      const json = (await res.json()) as { error?: string; merchantId?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not create the shop.");
        return;
      }
      router.push(`/admin/merchants/${json.merchantId}`);
      router.refresh();
    } catch {
      setError("Network error — the shop was not created.");
    } finally {
      setBusy(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <InlineAlert variant="warning" title="No accounts available." className="mt-6">
        A shop attaches to an existing Maanta account. Ask the owner to sign in once,
        then onboard them here.
      </InlineAlert>
    );
  }

  return (
    <form action={submit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="owner" className="text-xs font-semibold text-muted">
          Shop owner
        </label>
        <select
          id="owner"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className={`${inputClass} mt-1`}
          required
        >
          <option value="">Choose an account…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
              {c.sub ? ` — ${c.sub}` : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          Accounts that have signed in and are not already a merchant. Not listed? They
          have not signed in yet — a shop cannot be created without their account.
        </p>
      </div>

      <TextField name="merchantName" label="Shop name" required />
      <div>
        <TextField
          name="phone"
          label="Shop phone"
          placeholder="+254712345678"
          required
        />
        {/* Says what is accepted rather than letting the operator discover it from
            a rejection. The merchant-authored wizard is Kenya-only and says so
            there; this route is wider on purpose. */}
        <p className="mt-1 text-xs text-muted">
          Include the country code. Non-Kenyan numbers are accepted here — useful for a
          test shop — but a real shop should carry the number a shopper would call.
        </p>
      </div>

      <div>
        <label htmlFor="node" className="text-xs font-semibold text-muted">
          Node
        </label>
        <select id="node" name="node" className={`${inputClass} mt-1`} required>
          {NODES.filter((n) => n.live).map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      </div>

      <TextField
        name="what3wordsAddress"
        label="what3words"
        placeholder="stored.riches.shine"
        required
      />
      <TextField name="floor" label="Floor (optional)" />
      <TextField name="unitNumber" label="Unit (optional)" />
      <TextField name="email" label="Email (optional)" />
      <TextField name="whatsapp" label="WhatsApp (optional)" />
      <TextField name="entranceNotes" label="Entrance notes (optional)" />

      {error ? (
        <InlineAlert variant="error" title="Not created.">
          {error}
        </InlineAlert>
      ) : null}

      <Button type="submit" disabled={busy || !userId} full>
        {busy ? "Creating…" : "Create shop"}
      </Button>
    </form>
  );
}
