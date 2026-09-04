"use client";

import { useState } from "react";

/**
 * A masked waitlist number, revealed one row at a time.
 *
 * A console open on a shared screen — which at Node 0 means a laptop on a table
 * in a mall — must not leak a page of phone numbers to whoever walks past. So
 * the unmasked number is **never sent to the browser with the page**: the row
 * ships the mask, and revealing fetches that one number from the server, which
 * writes an `admin_ops_log` entry as it does. Same treatment personal data gets
 * everywhere else in this console.
 *
 * That also means a screenshot of this table is safe by default, and a reveal is
 * an act with a name against it rather than an accident of scrolling.
 */
export function RevealNumber({ contactId, masked }: { contactId: string; masked: string }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  if (revealed) {
    return (
      <span className="font-mono text-sm text-ink [font-feature-settings:'zero']">{revealed}</span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-sm text-ink [font-feature-settings:'zero']">{masked}</span>
      <button
        type="button"
        disabled={state === "loading"}
        onClick={async () => {
          setState("loading");
          try {
            const res = await fetch("/api/admin/growth/waitlist/reveal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contactId }),
            });
            const body = (await res.json()) as { phone?: string };
            if (!res.ok || !body.phone) {
              setState("error");
              return;
            }
            setRevealed(body.phone);
          } catch {
            setState("error");
          }
        }}
        className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-semibold text-muted hover:border-ink hover:text-ink disabled:text-faint"
      >
        {state === "loading" ? "…" : state === "error" ? "Retry" : "Reveal"}
      </button>
      {state === "error" ? (
        <span className="border-l-2 border-flame pl-1.5 text-[11px] text-ink">
          Could not read it
        </span>
      ) : null}
    </span>
  );
}
