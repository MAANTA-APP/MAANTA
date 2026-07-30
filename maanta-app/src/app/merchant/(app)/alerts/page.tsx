import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext } from "@/lib/merchant";
import { getSuccessFee } from "@/lib/data";
import { NotificationRow } from "@/components/ui/cards";
import { EmptyState } from "@/components/ui/states";
import { formatKes } from "@/lib/ui";

export const dynamic = "force-dynamic";

type Alert = { title: string; body: string; at: string; unread: boolean };

/** 10x Merchant alerts — derived from live wallet/deal/boost state. */
export default async function MerchantAlertsPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant } = res.ctx;
  const fee = await getSuccessFee();

  const service = createServiceClient();
  const alerts: Alert[] = [];

  // Verify-anyway: low/zero balance never blocks till verify — shortfalls become
  // arrears. Low-balance alerts must not imply verification is blocked.
  if (merchant.account_balance < fee * 4) {
    const covered = Math.max(0, Math.floor(merchant.account_balance / fee));
    alerts.push({
      title: `Balance low — ${formatKes(merchant.account_balance)} left`,
      body:
        covered > 0
          ? `About ${covered} more redemption${covered === 1 ? "" : "s"} before fees go to arrears. Top up to stay ahead.`
          : "You can still verify at the till — fees will record as arrears until you top up. New deals stay blocked at zero balance.",
      at: new Date().toISOString(),
      unread: true,
    });
  }

  const { data: expiring } = await service
    .from("deals")
    .select("title, expires_at")
    .eq("merchant_id", merchant.id)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .lt("expires_at", new Date(Date.now() + 2 * 3600_000).toISOString());
  for (const d of expiring ?? []) {
    alerts.push({
      title: "Deal expiring in 2h",
      body: d.title,
      at: new Date().toISOString(),
      unread: true,
    });
  }

  const { data: endedBoosts } = await service
    .from("boost_flags")
    .select("ends_at, deals(title)")
    .eq("merchant_id", merchant.id)
    .lt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: false })
    .limit(3);
  for (const b of (endedBoosts ?? []) as unknown as {
    ends_at: string;
    deals: { title: string } | null;
  }[]) {
    alerts.push({
      title: "Boost ended",
      body: b.deals?.title ?? "Priority placement finished",
      at: b.ends_at,
      unread: false,
    });
  }

  return (
    <main className="px-4 pt-5">
      <h1 className="text-2xl font-bold text-ink">Alerts</h1>
      {alerts.length === 0 ? (
        <EmptyState title="No alerts" sub="Wallet and deal alerts show up here" />
      ) : (
        <div className="mt-5 space-y-3">
          {alerts.map((a, i) => (
            <NotificationRow key={i} {...a} />
          ))}
        </div>
      )}
    </main>
  );
}
