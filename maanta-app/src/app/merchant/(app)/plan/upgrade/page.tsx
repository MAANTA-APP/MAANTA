import { getSuccessFee } from "@/lib/data";
import { getMerchantContext } from "@/lib/merchant";
import { canUseMerchantSurface } from "@/lib/merchant-nav";
import { MerchantPermissionDenied } from "@/components/merchant/permission-denied";
import { ButtonLink } from "@/components/ui/button";
import { IconBolt, IconCheck } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

/**
 * 10h Standard → Elite upgrade. Subscription payment isn't wired to a
 * processor yet — Elite is activated by the Maanta team (admin "Mark paid" /
 * "Grant trial" in 11f), so the CTA routes to support.
 */
export default async function UpgradePage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null; // layout guards
  // Plan changes spend money on the shop's behalf — same gate as boosts.
  if (!canUseMerchantSurface("plan", res.ctx.permissions)) {
    return <MerchantPermissionDenied action="change the plan" />;
  }

  const fee = await getSuccessFee();
  return (
    <main className="px-5 pt-6">
      <h1 className="text-center text-lg font-bold text-ink">Upgrade to Elite</h1>

      <div className="mt-6 space-y-3">
        {[
          ["2 active deals at a time (vs 1 on Standard)", null],
          ["Flash deals, 1–24h", "bolt"],
          ["Priority placement eligibility", null],
        ].map(([label, icon]) => (
          <div key={label as string} className="flex items-center gap-2.5">
            {icon === "bolt" ? (
              <IconBolt className="h-4 w-4 text-flame" />
            ) : (
              <IconCheck className="h-4 w-4 text-verified" />
            )}
            <span className="text-sm font-semibold text-ink">{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-card border-2 border-ink bg-ink p-5 text-center">
        <p className="text-2xl font-bold text-white">KES 3,500 / month</p>
        <p className="mt-1 text-xs text-white/70">
          Plus the standard KES {fee.toLocaleString("en-KE")} success fee per verified
          redemption
        </p>
      </div>

      <ButtonLink href="/merchant/support" full className="mt-6">
        Request Elite upgrade
      </ButtonLink>
      <p className="mt-2 text-center text-xs text-faint">
        Our team confirms your upgrade within a few minutes.
      </p>
    </main>
  );
}
