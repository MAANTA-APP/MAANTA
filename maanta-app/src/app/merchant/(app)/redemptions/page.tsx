import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext } from "@/lib/merchant";
import { RedemptionRow } from "@/components/ui/cards";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";

/** 10d Redemption history — Today / Week / All chips + total row. */
export default async function MerchantRedemptionsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant } = res.ctx;

  const range = ["today", "week", "all"].includes(searchParams.range ?? "")
    ? (searchParams.range as "today" | "week" | "all")
    : "today";

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();

  const service = createServiceClient();
  let query = service
    .from("redemptions")
    .select("id, status, redeemed_at, success_fee_charged")
    .eq("merchant_id", merchant.id)
    .neq("status", "pending")
    .order("redeemed_at", { ascending: false })
    .limit(100);
  if (range === "today") query = query.gte("redeemed_at", dayStart);
  if (range === "week") query = query.gte("redeemed_at", weekStart);
  const { data: rows } = await query;

  const verified = (rows ?? []).filter((r) => r.status === "success");
  const totalFees = verified.reduce((s, r) => s + Number(r.success_fee_charged), 0);

  return (
    <main className="px-4 pt-5">
      <h1 className="text-2xl font-bold text-ink">Redemptions</h1>
      <div className="mt-4 flex gap-2">
        {(["today", "week", "all"] as const).map((r) => (
          <Link
            key={r}
            href={`/merchant/redemptions${r === "today" ? "" : `?range=${r}`}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold capitalize",
              range === r ? "bg-ink text-white" : "bg-cream text-muted"
            )}
          >
            {r}
          </Link>
        ))}
      </div>

      <div className="mt-4 rounded-card bg-white shadow-card px-4">
        {(rows ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No redemptions {range === "all" ? "yet" : `this ${range === "today" ? "day" : "week"}`}
          </p>
        ) : (
          (rows ?? []).map((r) => (
            <RedemptionRow
              key={r.id}
              when={r.redeemed_at}
              status={r.status as "success" | "failed" | "flagged"}
              amount={r.success_fee_charged}
            />
          ))
        )}
      </div>

      {verified.length > 0 ? (
        <div className="mt-3 flex items-center justify-between rounded-card bg-cream px-4 py-3">
          <span className="text-sm font-semibold text-ink">
            Total {range === "today" ? "today" : range === "week" ? "this week" : ""}
          </span>
          <span className="text-sm font-bold text-ink">
            {verified.length} · -{Math.round(totalFees).toLocaleString("en-KE")}
          </span>
        </div>
      ) : null}
    </main>
  );
}
