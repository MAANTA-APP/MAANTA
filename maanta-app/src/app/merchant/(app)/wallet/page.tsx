import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext } from "@/lib/merchant";
import { TransactionRow } from "@/components/ui/cards";
import { ButtonLink } from "@/components/ui/button";
import { cn, formatKes } from "@/lib/ui";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "all", label: "All", types: null },
  { value: "topups", label: "Top-ups", types: ["topup", "refund"] },
  { value: "fees", label: "Fees", types: ["success_fee"] },
  { value: "boosts", label: "Boosts", types: ["boost_fee", "subscription"] },
] as const;

/** 10u Transaction history (wallet). */
export default async function WalletPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant } = res.ctx;

  const filter = FILTERS.find((f) => f.value === searchParams.filter) ?? FILTERS[0];

  const service = createServiceClient();
  let query = service
    .from("merchant_transactions")
    .select("id, amount, transaction_type, description, created_at")
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter.types) query = query.in("transaction_type", filter.types);
  const { data: rows } = await query;

  const weekStart = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data: weekFees } = await service
    .from("merchant_transactions")
    .select("amount")
    .eq("merchant_id", merchant.id)
    .eq("transaction_type", "success_fee")
    .gte("created_at", weekStart);
  const weekCount = (weekFees ?? []).length;
  const weekTotal = (weekFees ?? []).reduce((s, r) => s + Math.abs(Number(r.amount)), 0);

  const label = (t: string, desc: string | null) => {
    if (desc) return desc;
    if (t === "topup") return "Top-up";
    if (t === "success_fee") return "Success fee";
    if (t === "boost_fee") return "Boost";
    if (t === "subscription") return "Elite subscription";
    if (t === "refund") return "Refund";
    return t;
  };

  return (
    <main className="px-4 pt-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Wallet</h1>
        <span className="rounded-full bg-cream px-3 py-1 text-sm font-bold text-ink">
          {formatKes(merchant.account_balance)}
        </span>
      </div>

      {merchant.outstanding_arrears > 0 ? (
        <div className="mt-3 rounded-card border border-flame/40 bg-flame-tint px-4 py-3 text-sm text-ink">
          Outstanding arrears: <b>{formatKes(merchant.outstanding_arrears)}</b> — cleared
          automatically from your next top-up.
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/merchant/wallet${f.value === "all" ? "" : `?filter=${f.value}`}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold",
              filter.value === f.value ? "bg-brand text-ink" : "bg-cream text-muted"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        {(rows ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No transactions yet</p>
        ) : (
          (rows ?? []).map((t) => (
            <TransactionRow
              key={t.id}
              href={`/merchant/wallet/${t.id}`}
              title={label(t.transaction_type, t.description)}
              when={t.created_at}
              amount={Number(t.amount)}
            />
          ))
        )}
      </div>

      {weekCount > 0 ? (
        <p className="mt-4 text-center text-xs text-faint">
          This week: {weekCount} success fees · {formatKes(weekTotal)}
        </p>
      ) : null}

      <div className="mt-6">
        <ButtonLink href="/merchant/topup" full>
          Top up
        </ButtonLink>
      </div>
    </main>
  );
}
