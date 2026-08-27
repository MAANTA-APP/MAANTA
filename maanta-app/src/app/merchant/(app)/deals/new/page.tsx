import Link from "next/link";
import { getMerchantContext } from "@/lib/merchant";
import { getSuccessFee } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/service";
import { activeDealLimit, activeDealLimitCopy } from "@/lib/plan-limits";
import { NewDealWizard } from "./new-deal-wizard";

export const dynamic = "force-dynamic";

/** Create deal — pre-flight cap before the expensive multi-step wizard. */
export default async function NewDealPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant, permissions } = res.ctx;
  const fee = await getSuccessFee();

  // Preserve the permission-specific experience. A staff member who cannot
  // create deals should hear that reason rather than a plan-cap reason.
  if (!permissions.can_deals) {
    return (
      <NewDealWizard
        tier={merchant.tier}
        fee={fee}
        canDeals={false}
        balance={merchant.account_balance}
      />
    );
  }

  // UX pre-flight only. This mirrors the trigger occupancy predicate
  // (is_active = TRUE), including paused and expired-but-unarchived rows.
  // The INSERT trigger remains authoritative against races.
  const { count, error } = await createServiceClient()
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchant.id)
    .eq("is_active", true);

  if (error) {
    console.error("deal slot pre-flight unavailable", {
      merchantId: merchant.id,
      error,
    });
    return (
      <main className="px-6 py-20 text-center">
        <h1 className="text-xl font-bold text-ink">Couldn&apos;t check deal availability</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          We couldn&apos;t confirm whether your plan has a free deal slot. Try again
          before uploading a cover image.
        </p>
        <div className="mt-6 flex justify-center gap-4 text-sm font-semibold">
          <Link href="/merchant/deals/new" className="text-ink underline">
            Try again
          </Link>
          <Link href="/merchant/deals" className="text-muted underline">
            Manage deals
          </Link>
        </div>
      </main>
    );
  }

  const used = count ?? 0;
  const limit = activeDealLimit(merchant.tier);

  if (used >= limit) {
    return (
      <main className="px-6 py-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Deal limit reached
        </p>
        <h1 className="mt-2 text-xl font-bold text-ink">
          {activeDealLimitCopy(merchant.tier)}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Archive an existing or ended deal to free a slot before creating another.
        </p>
        <Link
          href="/merchant/deals"
          className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-sm font-semibold text-white"
        >
          Manage deals
        </Link>
      </main>
    );
  }

  return (
    <NewDealWizard
      tier={merchant.tier}
      fee={fee}
      canDeals={permissions.can_deals}
      balance={merchant.account_balance}
    />
  );
}
