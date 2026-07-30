import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { SearchField } from "@/components/ui/inputs";
import { FraudChip } from "@/components/ui/chips";
import { ModerationActions } from "./moderation-actions";

export const dynamic = "force-dynamic";

/**
 * 11c Deal moderation (flagged only). There is no shopper-side "report deal"
 * source yet, so this surfaces deals whose merchant has unresolved fraud
 * events — the only organic flag signal in the DB today.
 *
 * Reason chips (misleading / prohibited) are design-ahead until a report
 * taxonomy exists; they were previously rendered as filters that did not
 * change the query, which implied a capability the backend cannot prove.
 */
export default async function AdminDealsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  await requireAdminPage();

  const q = (searchParams.q ?? "").trim();

  const service = createServiceClient();
  const { data: events } = await service
    .from("fraud_events")
    .select("merchant_id")
    .eq("resolved", false);
  const flaggedMerchants = Array.from(
    new Set((events ?? []).map((e) => e.merchant_id).filter(Boolean))
  ) as string[];

  let deals: {
    id: string;
    title: string;
    merchants: { merchant_name: string } | null;
  }[] = [];
  if (flaggedMerchants.length > 0) {
    let query = service
      .from("deals")
      .select("id, title, merchants(merchant_name)")
      .in("merchant_id", flaggedMerchants)
      .eq("is_active", true)
      .limit(30);
    if (q) query = query.ilike("title", `%${q}%`);
    const { data } = await query;
    deals = (data ?? []) as unknown as typeof deals;
  }

  return (
    <main className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink">Flagged deals ({deals.length})</h1>
      <p className="mt-1 text-sm text-muted">
        From unresolved fraud signals — report-reason filters are not live yet.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <form action="/admin/deals" className="w-full max-w-md">
          <SearchField name="q" defaultValue={q} placeholder="Search deals…" />
        </form>
      </div>

      <div className="mt-5 space-y-3">
        {deals.length === 0 ? (
          <p className="rounded-card border border-line bg-white px-4 py-8 text-center text-sm text-muted">
            No flagged deals
          </p>
        ) : (
          deals.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">
                  &ldquo;{d.title}&rdquo; — {d.merchants?.merchant_name}
                </p>
              </div>
              {/* A9 — reuse FraudChip (text+border token) instead of a
                  hand-rolled solid-flame chip duplicated inline. */}
              <FraudChip reason="Fraud signals" />
              <ModerationActions dealId={d.id} />
            </div>
          ))
        )}
      </div>
    </main>
  );
}
