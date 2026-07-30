import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { cn } from "@/lib/ui";

type CapRow = {
  cap: number;
  granted: number;
  remaining: number;
};

/**
 * Launch-offer Elite trial slot counter for admin surfaces.
 * Reads elite_trial_cap_status() (service_role). Failures degrade to a quiet
 * notice rather than taking the page down — the grant paths still enforce the
 * cap in the database.
 */
export async function EliteTrialCapStatus({
  className,
  compact = false,
}: {
  className?: string;
  /** One-line form for merchant detail / approve context. */
  compact?: boolean;
}) {
  const service = createServiceClient();
  const { data, error } = await service.rpc("elite_trial_cap_status");

  if (error) {
    return (
      <p className={cn("text-xs text-muted", className)}>
        Elite trial cap status unavailable — check after the
        `20260730130000` migration is applied.
      </p>
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as CapRow | null;
  if (!row) {
    return null;
  }

  const cap = Number(row.cap) || 0;
  const granted = Number(row.granted) || 0;
  const remaining = Number(row.remaining) || 0;
  const exhausted = remaining <= 0;

  if (compact) {
    return (
      <p
        className={cn(
          "text-xs",
          exhausted ? "font-semibold text-ink" : "text-muted",
          className
        )}
      >
        Elite launch offer:{" "}
        <span className="tnum font-semibold text-ink">
          {granted}/{cap}
        </span>{" "}
        used
        {exhausted
          ? " — fully claimed (approve still works; no new trial)."
          : ` · ${remaining} remaining.`}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "rounded-card border border-line bg-cream/60 px-4 py-3.5",
        className
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-ink">Elite trial launch offer</p>
        <p className="tnum text-sm font-semibold text-ink">
          {granted} / {cap} used
        </p>
      </div>
      <p className="mt-1 text-xs text-muted">
        First {cap} BBS Mall merchants · durable slots (downgrade does not free
        one). Demo rows do not count.
        {exhausted
          ? " Offer fully claimed — Grant trial will return 409; approve still activates on Standard."
          : ` ${remaining} slot${remaining === 1 ? "" : "s"} remaining.`}
      </p>
      <p className="mt-2 text-xs text-muted">
        Source:{" "}
        <code className="text-[11px]">elite_trial_cap_status()</code>
        {" · "}
        <Link href="/admin/billing" className="font-semibold text-ink underline">
          Plans &amp; trials
        </Link>
      </p>
    </div>
  );
}
