import { getMerchantContext } from "@/lib/merchant";
import { merchantMoreRows } from "@/lib/merchant-nav";
import { SettingsRow } from "@/components/ui/cards";

export const dynamic = "force-dynamic";

/** "More" tab — dashboard, history, staff, plan, alerts, settings, support. */
export default async function MerchantMorePage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { isOwner, permissions } = res.ctx;
  const rows = merchantMoreRows(permissions, isOwner);

  return (
    <main className="px-4 pt-5">
      <h1 className="text-2xl font-bold text-ink">More</h1>
      <div className="mt-6 space-y-3">
        {rows.map((row) => (
          <SettingsRow key={row.href} href={row.href} label={row.label} />
        ))}
      </div>
    </main>
  );
}
