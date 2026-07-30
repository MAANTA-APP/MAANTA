import { getMerchantContext } from "@/lib/merchant";
import { canUseMerchantSurface } from "@/lib/merchant-nav";
import { ButtonLink } from "@/components/ui/button";
import { SettingsRow } from "@/components/ui/cards";
import { timeLeftLabel } from "@/lib/ui";
import { formatAdminTrialStatus } from "@/lib/elite-trial";

export const dynamic = "force-dynamic";

/** 10g Plan / billing. */
export default async function PlanPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant, permissions } = res.ctx;
  const canPurchase = canUseMerchantSurface("plan", permissions);

  const isElite = merchant.tier === "elite";
  const trialLabel = formatAdminTrialStatus({
    eliteTrialActive: merchant.elite_trial_active,
    trialEndsAt: merchant.trial_ends_at,
    gracePeriodEndsAt: merchant.grace_period_ends_at,
  });

  return (
    <main className="px-4 pt-5">
      <h1 className="text-center text-lg font-bold text-ink">Plan</h1>

      <div className="mt-6 rounded-card border-2 border-ink bg-white p-5">
        <p className="text-xl font-bold text-ink">{isElite ? "Elite" : "Standard"}</p>
        <p className="mt-1 text-sm text-muted">
          {isElite
            ? "2 active deals · flash deals · boosts"
            : "1 active deal · 24h fixed schedule"}
        </p>
        {trialLabel ? (
          <p className="mt-2 inline-block rounded-full bg-brand px-3 py-1 text-xs font-bold text-ink">
            {trialLabel}
            {merchant.grace_period_ends_at &&
            new Date(merchant.grace_period_ends_at).getTime() > Date.now()
              ? ` (${timeLeftLabel(merchant.grace_period_ends_at)})`
              : merchant.trial_ends_at
                ? ` (${timeLeftLabel(merchant.trial_ends_at)})`
                : ""}
          </p>
        ) : null}
      </div>

      {!isElite && canPurchase ? (
        <ButtonLink href="/merchant/plan/upgrade" variant="secondary" full className="mt-4">
          Upgrade to Elite — KES 3,500/mo
        </ButtonLink>
      ) : null}

      <div className="mt-6 space-y-3">
        <SettingsRow href="/merchant/plan/success-fee" label="How the success fee works" />
        <SettingsRow href="/merchant/wallet" label="Transaction history" />
      </div>
    </main>
  );
}
