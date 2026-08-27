import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { SearchField } from "@/components/ui/inputs";
import { cn } from "@/lib/ui";
import {
  formatAdminTrialStatus,
  formatEliteTrialCapLine,
  parseEliteTrialCapStatus,
} from "@/lib/elite-trial";
import { PlanActions } from "./plan-actions";
import { AdminReadError } from "@/components/admin/read-error";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "elite", "trial", "standard"] as const;

/** 11f Elite trial + subscription management (Plans & trials). */
export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: { q?: string; filter?: string };
}) {
  await requireAdminPage();

  const q = (searchParams.q ?? "").trim();
  const filter = (FILTERS as readonly string[]).includes(searchParams.filter ?? "")
    ? searchParams.filter!
    : "all";

  const service = createServiceClient();
  let query = service
    .from("merchants")
    .select("id, merchant_name, tier, elite_trial_active, trial_ends_at, grace_period_ends_at, status")
    .neq("status", "churned")
    .order("merchant_name")
    .limit(300);
  if (q) query = query.ilike("merchant_name", `%${q}%`);
  if (filter === "elite") query = query.eq("tier", "elite").eq("elite_trial_active", false);
  if (filter === "trial") query = query.eq("elite_trial_active", true);
  if (filter === "standard") query = query.eq("tier", "standard");
  const [merchantsRes, capRes] = await Promise.all([
    query,
    service.rpc("elite_trial_cap_status"),
  ]);

  if (merchantsRes.error || capRes.error) {
    return (
      <main className="max-w-4xl">
        <h1 className="text-2xl font-bold text-ink">Plans &amp; trials</h1>
        <div className="mt-5"><AdminReadError what="plans and trials" /></div>
      </main>
    );
  }

  const merchants = merchantsRes.data;
  const trialCap = parseEliteTrialCapStatus(capRes.data);

  return (
    <main className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink">Plans &amp; trials</h1>
      {trialCap ? (
        <p className="mt-2 text-sm text-muted" data-testid="elite-trial-cap-line">
          {formatEliteTrialCapLine(trialCap)}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <form action="/admin/billing" className="w-full max-w-md">
          <SearchField name="q" defaultValue={q} placeholder="Search shops…" />
        </form>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={`/admin/billing${f === "all" ? "" : `?filter=${f}`}`}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize",
                // A6 — active filter pill is neutral ink, not amber; amber is
                // reserved for the one primary action (the row CTA).
                filter === f ? "bg-ink text-white" : "bg-cream text-muted"
              )}
            >
              {f}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {(merchants ?? []).length === 0 ? (
          <p className="rounded-card bg-white shadow-card px-4 py-8 text-center text-sm text-muted">
            No shops match
          </p>
        ) : (
          (merchants ?? []).map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-3 rounded-card bg-white shadow-card px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{m.merchant_name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {formatAdminTrialStatus({
                    eliteTrialActive: m.elite_trial_active,
                    trialEndsAt: m.trial_ends_at,
                    gracePeriodEndsAt: m.grace_period_ends_at,
                  }) ?? (m.tier === "elite" ? "Elite" : "Standard")}
                </p>
              </div>
              <PlanActions
                merchantId={m.id}
                tier={m.tier as "standard" | "elite"}
                onTrial={m.elite_trial_active}
              />
            </div>
          ))
        )}
      </div>
    </main>
  );
}
