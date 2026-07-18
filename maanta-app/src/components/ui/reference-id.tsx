"use client";

import { useState } from "react";
import { cn } from "@/lib/ui";

/**
 * ReferenceId (registry §3) — every money movement carries a copyable ID, shown
 * on the success takeover and again in the ledger so one movement is findable
 * in two places. Mono, one-tap copy. `tone="inverse"` for dark success fills.
 */
export function ReferenceId({
  value,
  display,
  label = "Ref",
  tone = "default",
  className,
}: {
  value: string;
  /** Compact text to show while still copying the full `value`. */
  display?: string;
  label?: string;
  tone?: "default" | "inverse";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const inverse = tone === "inverse";

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — value stays visible to read aloud */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left",
        inverse ? "border-white/40 bg-transparent" : "border-line bg-cream",
        className
      )}
      aria-label={`Copy reference ${value}`}
    >
      <span className={cn("text-[10px] font-semibold uppercase tracking-[0.1em]", inverse ? "text-white/70" : "text-muted")}>
        {label}
      </span>
      <span className={cn("font-code text-xs tracking-[0.06em]", inverse ? "text-white" : "text-ink")}>
        {display ?? value}
      </span>
      <span className={cn("ml-auto text-xs font-semibold", inverse ? "text-white" : "text-ink")}>
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
