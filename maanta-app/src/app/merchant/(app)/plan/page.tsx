import { getMerchantContext } from "@/lib/merchant";
import { getSuccessFee } from "@/lib/data";
import { ButtonLink } from "@/components/ui/button";
import { SettingsRow } from "@/components/ui/cards";
import { timeLeftLabel } from "@/lib/ui";

export const dynamic = "force-dynamic";

/** 10g Plan / billing. */
export default async function PlanPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant } = res.ctx;
  await getSuccessFee();

  const isElite = merchant.tier === "elite";
  const trialDaysLeft =
    merchant.elite_trial_active && merchant.trial_ends_at
      ? Math.max(
          0,
          Math.ceil(
            (new Date(merchant.trial_ends_at).getTime() - Date.now()) / (24 * 3600_000)
          )
        )
      : null;

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
        {trialDaysLeft != null ? (
          <p className="mt-2 inline-block rounded-full bg-brand px-3 py-1 text-xs font-bold text-ink">
            Elite trial · {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left
            {merchant.trial_ends_at ? ` (${timeLeftLabel(merchant.trial_ends_at)})` : ""}
          </p>
        ) : null}
      </div>

      {!isElite ? (
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
