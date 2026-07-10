import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { SearchField } from "@/components/ui/inputs";
import { cn } from "@/lib/ui";
import { PlanActions } from "./plan-actions";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "elite", "trial", "standard"] as const;

/** 11f Elite trial + subscription management (Plans & trials). */
export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: { q?: string; filter?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const filter = (FILTERS as readonly string[]).includes(searchParams.filter ?? "")
    ? searchParams.filter!
    : "all";

  const service = createServiceClient();
  let query = service
    .from("merchants")
    .select("id, merchant_name, tier, elite_trial_active, trial_ends_at, status")
    .neq("status", "churned")
    .order("merchant_name")
    .limit(100);
  if (q) query = query.ilike("merchant_name", `%${q}%`);
  if (filter === "elite") query = query.eq("tier", "elite").eq("elite_trial_active", false);
  if (filter === "trial") query = query.eq("elite_trial_active", true);
  if (filter === "standard") query = query.eq("tier", "standard");
  const { data: merchants } = await query;

  const trialLabel = (m: { elite_trial_active: boolean; trial_ends_at: string | null }) => {
    if (!m.elite_trial_active || !m.trial_ends_at) return null;
    const days = Math.max(
      0,
      Math.ceil((new Date(m.trial_ends_at).getTime() - Date.now()) / (24 * 3600_000))
    );
    return `Elite trial · ${days} day${days === 1 ? "" : "s"} left`;
  };

  return (
    <main className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink">Plans &amp; trials</h1>

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
                filter === f ? "bg-brand text-ink" : "bg-cream text-muted"
              )}
            >
              {f}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {(merchants ?? []).length === 0 ? (
          <p className="rounded-card border border-line bg-white px-4 py-8 text-center text-sm text-muted">
            No shops match
          </p>
        ) : (
          (merchants ?? []).map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{m.merchant_name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {trialLabel(m) ?? (m.tier === "elite" ? "Elite" : "Standard")}
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
