import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { SearchField } from "@/components/ui/inputs";
import { StatusChip, PlanChip } from "@/components/ui/chips";
import { formatKes } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * Merchants directory (sidebar item).
 *
 * TODO(admin-users): admin has no shopper/customer (public.users) list or
 * detail — only merchants are listable. Add a users surface + detail. Tracked
 * feature ticket — see docs/skills/ui-walkthrough-roles.md (A2).
 */
export default async function AdminMerchantsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  await requireAdminPage();

  const q = (searchParams.q ?? "").trim();
  const service = createServiceClient();
  let query = service
    .from("merchants")
    .select("id, merchant_name, status, tier, floor, account_balance, is_featured, is_shadow_banned")
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) query = query.ilike("merchant_name", `%${q}%`);
  const { data: merchants } = await query;

  return (
    <main className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink">Merchants</h1>
      <form className="mt-5 max-w-md" action="/admin/merchants">
        <SearchField name="q" defaultValue={q} placeholder="Search shops…" />
      </form>
      <div className="mt-5 space-y-3">
        {(merchants ?? []).map((m) => (
          <Link
            key={m.id}
            href={`/admin/merchants/${m.id}`}
            className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3.5 hover:bg-cream/50"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">
                {m.merchant_name}
                {m.floor ? ` — ${m.floor}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Wallet {formatKes(m.account_balance)}
                {m.is_featured ? " · Featured" : ""}
                {m.is_shadow_banned ? " · Shadow-banned" : ""}
              </p>
            </div>
            <PlanChip plan={m.tier as "standard" | "elite"} />
            <StatusChip status={m.status} />
          </Link>
        ))}
        {(merchants ?? []).length === 0 ? (
          <p className="rounded-card border border-line bg-white px-4 py-8 text-center text-sm text-muted">
            No merchants yet
          </p>
        ) : null}
      </div>
    </main>
  );
}
