import { getSuccessFee } from "@/lib/data";
import { formatKes } from "@/lib/ui";

export const dynamic = "force-dynamic";

/** 10i Success fee explainer — fee comes from app_config, never hardcoded. */
export default async function SuccessFeePage() {
  const fee = await getSuccessFee();

  return (
    <main className="px-5 pt-6">
      <h1 className="text-center text-lg font-bold text-ink">Success fee</h1>

      <p className="mt-6 text-sm text-ink">
        A <b>success fee</b> is charged only when a redemption is verified in-store.
      </p>
      <ul className="mt-4 space-y-2 text-sm text-ink">
        <li className="flex gap-2">
          <span>•</span> {formatKes(fee)} per verified redemption
        </li>
        <li className="flex gap-2">
          <span>•</span> Nothing charged for expired or rejected codes
        </li>
      </ul>

      <div className="mt-6 rounded-card bg-cream p-4">
        <p className="text-xs text-muted">Example: 20 redemptions today</p>
        <p className="mt-1 text-base font-bold text-ink">
          20 × {formatKes(fee)} = {formatKes(20 * fee)}
        </p>
      </div>
    </main>
  );
}
