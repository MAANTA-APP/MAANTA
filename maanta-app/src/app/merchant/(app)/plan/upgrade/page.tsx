import { getSuccessFee } from "@/lib/data";
import { ACTIVE_DEAL_LIMITS } from "@/lib/plan-limits";
import { ButtonLink } from "@/components/ui/button";
import { IconBolt, IconCheck } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

/**
 * 10h Standard → Elite upgrade. Subscription payment isn't wired to a
 * processor yet — Elite is activated by the Maanta team (admin "Mark paid" /
 * "Grant trial" in 11f), so the CTA routes to support.
 */
export default async function UpgradePage() {
  const fee = await getSuccessFee();
  return (
    <main className="px-5 pt-6">
      <h1 className="text-center text-lg font-bold text-ink">Upgrade to Elite</h1>

      <div className="mt-6 space-y-3">
        {[
          [
            `${ACTIVE_DEAL_LIMITS.elite} active deals at a time (vs ${ACTIVE_DEAL_LIMITS.standard} on Standard)`,
            null,
          ],
          ["Flash deals, 1–24h", "bolt"],
          ["Boost deals into Neighbourhood favourites", null],
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
        {/* No monthly figure — founder ruling 2026-08-24. Elite's price is not
            set, and a merchant must not be able to read one off this screen. The
            success fee is a different, live commitment and stays stated. */}
        <p className="text-2xl font-bold text-white">Pricing coming soon</p>
        <p className="mt-1 text-xs text-white/70">
          The KES {fee.toLocaleString("en-KE")} success fee per verified redemption
          applies on Elite exactly as it does on Standard
        </p>
      </div>

      {/* "Request upgrade" + "confirmed within minutes" promised a commitment
          to an unpublished price. Registering interest is what this button can
          truthfully do until Elite is priced. The journey is otherwise unchanged. */}
      <ButtonLink href="/merchant/support" full className="mt-6">
        Ask about Elite
      </ButtonLink>
      <p className="mt-2 text-center text-xs text-faint">
        Elite pricing is not set yet. Nothing is charged without your agreement.
      </p>
    </main>
  );
}
