import { getMerchantContext } from "@/lib/merchant";
import { ButtonLink } from "@/components/ui/button";
import { SettingsRow } from "@/components/ui/cards";
import { InlineAlert } from "@/components/ui/inline-alert";
import { formatMerchantTrialStatus } from "@/lib/elite-trial";
import { ACTIVE_DEAL_LIMITS } from "@/lib/plan-limits";

export const dynamic = "force-dynamic";

/** 10g Plan / billing (trial + 14n grace states). */
export default async function PlanPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant } = res.ctx;

  const isElite = merchant.tier === "elite";
  const trialStatus = formatMerchantTrialStatus({
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
            ? `${ACTIVE_DEAL_LIMITS.elite} active deals · flash deals · boosts`
            : `${ACTIVE_DEAL_LIMITS.standard} active deal · 24h fixed schedule`}
        </p>
        {trialStatus && !trialStatus.body ? (
          <p className="mt-2 inline-block rounded-full bg-brand px-3 py-1 text-xs font-bold text-ink">
            {trialStatus.label}
          </p>
        ) : null}
      </div>

      {/* Grace states carry a body and are a be-careful state, so they render
          as the rust inline alert, never the amber pill (amber means act). */}
      {trialStatus?.body ? (
        <InlineAlert variant="warning" title={trialStatus.label} className="mt-4">
          {trialStatus.body}
        </InlineAlert>
      ) : null}

      {!isElite ? (
        <ButtonLink href="/merchant/plan/upgrade" variant="secondary" full className="mt-4">
          Upgrade to Elite
        </ButtonLink>
      ) : null}

      <div className="mt-6 space-y-3">
        <SettingsRow href="/merchant/plan/success-fee" label="How the success fee works" />
        <SettingsRow href="/merchant/wallet" label="Transaction history" />
      </div>
    </main>
  );
}
