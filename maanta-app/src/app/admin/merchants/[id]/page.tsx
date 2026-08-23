import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { W3wChip, StatusChip, PlanChip } from "@/components/ui/chips";
import { IconCheck } from "@/components/ui/icons";
import { formatKes } from "@/lib/ui";
import {
  formatAdminTrialStatus,
  parseEliteTrialCapStatus,
  type EliteTrialCapStatus,
} from "@/lib/elite-trial";
import { MerchantAdminActions } from "./merchant-admin-actions";
import { MerchantLocationForm } from "./merchant-location-form";

export const dynamic = "force-dynamic";

/** 11b Merchant detail / verify (+ 11j approve confirmation modal). */
export default async function AdminMerchantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminPage();

  const service = createServiceClient();
  const [{ data: m }, { data: capRows }] = await Promise.all([
    service
      .from("merchants")
      .select(
        "id, merchant_name, status, tier, elite_trial_active, trial_ends_at, grace_period_ends_at, elite_trial_granted_at, phone, email, whatsapp, floor, unit_number, entrance_notes, what3words_address, lat, lng, mall_name, node, account_balance, is_featured, is_shadow_banned, trust_metric"
      )
      .eq("id", params.id)
      .maybeSingle(),
    service.rpc("elite_trial_cap_status"),
  ]);
  if (!m) notFound();

  const trialCap: EliteTrialCapStatus | null = parseEliteTrialCapStatus(capRows);

  const trialStatus = formatAdminTrialStatus({
    eliteTrialActive: m.elite_trial_active === true,
    trialEndsAt: m.trial_ends_at,
    gracePeriodEndsAt: m.grace_period_ends_at,
  });

  return (
    <main className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink">{m.merchant_name}</h1>
        <StatusChip status={m.status} />
        <PlanChip plan={m.tier as "standard" | "elite"} />
      </div>
      <p className="mt-2 text-sm text-muted">
        {/* D158 — phone may be NULL for a shop onboarded on a verified email.
            The email is only appended as a SECOND channel; when it is already
            standing in as the primary it must not print twice. */}
        Contact: {m.phone ?? m.email ?? "No contact on file"}
        {m.phone && m.email ? ` · ${m.email}` : ""}
      </p>
      <p className="mt-1 text-sm text-muted">
        {[m.floor, m.unit_number].filter(Boolean).join(", ") || "No floor/unit"}
        {" · "}Wallet{" "}
        {/* A5 — money is ink + tabular, never the `muted` non-money token. */}
        <span className="tnum font-semibold text-ink">{formatKes(m.account_balance)}</span> ·
        Trust <span className="tnum">{Number(m.trust_metric).toFixed(2)}</span>
      </p>
      {trialStatus ? (
        <p className="mt-2 text-sm font-semibold text-ink" data-testid="admin-trial-status">
          {trialStatus}
          {m.trial_ends_at ? (
            <span className="ml-2 font-normal text-muted">
              trial ends {new Date(m.trial_ends_at).toLocaleDateString()}
            </span>
          ) : null}
          {m.grace_period_ends_at ? (
            <span className="ml-2 font-normal text-muted">
              · grace ends {new Date(m.grace_period_ends_at).toLocaleDateString()}
            </span>
          ) : null}
        </p>
      ) : m.elite_trial_granted_at ? (
        <p className="mt-2 text-xs text-muted" data-testid="admin-trial-slot-consumed">
          Launch-offer trial slot consumed{" "}
          {new Date(m.elite_trial_granted_at).toLocaleDateString()} (not currently on trial)
        </p>
      ) : null}

      <div className="mt-4 inline-flex items-center gap-2 rounded-card bg-cream px-4 py-3 text-sm text-ink">
        <IconCheck className="h-4 w-4 text-verified" />
        w3w resolved: <W3wChip address={m.what3words_address} />
        {m.entrance_notes ? <span className="text-muted">— {m.entrance_notes}</span> : null}
      </div>

      <MerchantAdminActions
        merchantId={m.id}
        merchantName={m.merchant_name}
        status={m.status}
        node={m.mall_name ?? m.node}
        w3w={m.what3words_address}
        floorUnit={[m.floor, m.unit_number].filter(Boolean).join(", ")}
        isFeatured={m.is_featured}
        isShadowBanned={m.is_shadow_banned}
        trialCap={trialCap}
      />

      <MerchantLocationForm
        merchantId={m.id}
        initialW3w={m.what3words_address}
        initialLat={typeof m.lat === "number" ? m.lat : null}
        initialLng={typeof m.lng === "number" ? m.lng : null}
      />
    </main>
  );
}
