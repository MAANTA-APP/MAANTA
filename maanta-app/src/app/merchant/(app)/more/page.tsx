import { getMerchantContext } from "@/lib/merchant";
import { SettingsRow } from "@/components/ui/cards";

export const dynamic = "force-dynamic";

/** "More" tab — dashboard, history, staff, plan, alerts, settings, support. */
export default async function MerchantMorePage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { isOwner } = res.ctx;

  return (
    <main className="px-4 pt-5">
      <h1 className="text-2xl font-bold text-ink">More</h1>
      <div className="mt-6 space-y-3">
        <SettingsRow href="/merchant/dashboard" label="Dashboard" />
        <SettingsRow href="/merchant/redemptions" label="Redemption history" />
        <SettingsRow href="/merchant/alerts" label="Alerts" />
        {isOwner ? <SettingsRow href="/merchant/staff" label="Staff" /> : null}
        <SettingsRow href="/merchant/plan" label="Plan & billing" />
        <SettingsRow href="/merchant/settings" label="Settings" />
        <SettingsRow href="/merchant/support" label="Support" />
      </div>
    </main>
  );
}
