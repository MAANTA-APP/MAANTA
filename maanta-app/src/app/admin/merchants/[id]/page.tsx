import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { W3wChip, StatusChip, PlanChip } from "@/components/ui/chips";
import { KpiCard } from "@/components/ui/cards";
import { IconCheck } from "@/components/ui/icons";
import { formatKes, formatKesSigned, friendlyTime, maskPhone, relativeAgo } from "@/lib/ui";
import {
  formatAdminTrialStatus,
  parseEliteTrialCapStatus,
  type EliteTrialCapStatus,
} from "@/lib/elite-trial";
import { MerchantAdminActions } from "./merchant-admin-actions";
import { MerchantLocationForm } from "./merchant-location-form";
import { PlanActions } from "@/app/admin/billing/plan-actions";
import { OverrideButton } from "@/app/admin/support/override-button";
import { AdminReadError } from "@/components/admin/read-error";
import { FEE_FIGURE_LABELS, feeFigure } from "@/components/admin/fee-figures";
import { readLedgerFeeTotals } from "@/lib/evidence-scope";
import { activeDealLimit, normaliseTier, planLabel } from "@/lib/plan-limits";
import { publicMerchantBlocker } from "@/lib/merchant-visibility";
import { classifyMerchant, cohortEntry, evidenceClassLabel } from "@/lib/pilot-cohort";
import { claimAllocation, claimAllocationLine, CLAIM_ALLOCATION_LABELS } from "@/lib/claim-allocation";
import { adminDealState } from "@/lib/admin-deal-state";
import { DealStateChip } from "@/components/admin/deal-state-chip";
import { countStages, visitStage, VISIT_STAGE_META, type VisitStage } from "@/lib/visit-funnel";
import { VisitStageChip } from "@/components/admin/visit-stage-chip";
import {
  formatMerchantLedgerLabel,
  isOpeningCredit,
  openingCreditAmount,
} from "@/lib/merchant-ledger-copy";
import { nodeLabel } from "@/lib/nodes";

export const dynamic = "force-dynamic";

/** Bounded list reads. Each states on the page when it bites. */
const LIMITS = { deals: 100, redemptions: 60, ledger: 40, tasks: 30, audit: 40, staff: 50, topups: 10 } as const;

/** The dawn of time, for the all-time fee figure through the one shared reader. */
const EPOCH = "1970-01-01T00:00:00.000Z";

/**
 * Merchant 360 — everything the console knows about one shop, on one page.
 *
 * When Merchant 01 calls, the operator should not need six routes to answer.
 * Eight sections, each anchored so the Action Queue can land on the one it
 * means: identity, staff, deals, shopper activity, economics, support, admin
 * actions, audit.
 *
 * ## What this page will not do
 *
 * - **It exposes no control the backend does not enforce.** Pause, resume and
 *   allocation are merchant-only (`PATCH /api/deals/[id]` requires the
 *   merchant context); blacklisting a shopper has no admin route at all.
 *   Where such a control would be expected the page says it does not exist,
 *   rather than drawing a button that calls nothing.
 * - **It counts nothing twice.** A claim and a redemption are one row; the
 *   stage column is what separates them (`lib/visit-funnel.ts`).
 * - **Money comes from the ledger through the one shared reader**, never from
 *   `redemptions.success_fee_charged` — a success whose fee step failed carries
 *   a fee amount that never reached the ledger.
 * - **A failed read is a dash and a stated failure, never a zero.** Each
 *   section reads independently, so one failure blanks one section.
 */
export default async function AdminMerchantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminPage();

  const service = createServiceClient();
  const now = new Date();

  const [merchantRes, capRes] = await Promise.all([
    service
      .from("merchants")
      .select(
        "id, merchant_name, status, tier, elite_trial_active, trial_ends_at, grace_period_ends_at, elite_trial_granted_at, phone, email, whatsapp, floor, unit_number, entrance_notes, what3words_address, lat, lng, mall_name, node, account_balance, outstanding_arrears, is_featured, is_shadow_banned, is_visible, is_demo, trust_metric, created_at, onboarded_at, updated_at"
      )
      .eq("id", params.id)
      .maybeSingle(),
    service.rpc("elite_trial_cap_status"),
  ]);
  if (merchantRes.error || capRes.error) {
    return (
      <main className="max-w-4xl">
        <h1 className="text-2xl font-bold text-ink">Merchant detail</h1>
        <div className="mt-5"><AdminReadError what="merchant details" /></div>
      </main>
    );
  }
  const m = merchantRes.data;
  if (!m) notFound();

  const trialCap: EliteTrialCapStatus | null = parseEliteTrialCapStatus(capRes.data);
  const trialStatus = formatAdminTrialStatus({
    eliteTrialActive: m.elite_trial_active === true,
    trialEndsAt: m.trial_ends_at,
    gracePeriodEndsAt: m.grace_period_ends_at,
  });
  const tier = normaliseTier(m.tier);

  // Every section reads on its own so one failure blanks one section.
  const [
    staffRes,
    dealsRes,
    redemptionsRes,
    claimsAllRes,
    successAllRes,
    ledgerRes,
    feesAllTime,
    tasksRes,
    auditRes,
    fraudRes,
    topupsRes,
  ] = await Promise.all([
    service
      .from("merchant_staff")
      .select("id, staff_name, phone, email, user_id, can_verify, can_deals, can_topup, can_purchase, invited_at")
      .eq("merchant_id", m.id)
      .order("created_at", { ascending: true })
      .limit(LIMITS.staff),
    service
      .from("deals")
      .select("id, title, deal_type, is_active, is_paused, is_demo, boost_active, max_claims, claims_count, claims_reserved, expires_at, created_at")
      .eq("merchant_id", m.id)
      .order("created_at", { ascending: false })
      .limit(LIMITS.deals),
    service
      .from("redemptions")
      .select(
        "id, status, claimed_at, arrived_at, redeemed_at, expires_at, user_id, deals(title), users(full_name), merchant_presentations(status, expires_at)"
      )
      .eq("merchant_id", m.id)
      .order("redeemed_at", { ascending: false })
      .limit(LIMITS.redemptions),
    service.from("redemptions").select("id", { count: "exact", head: true }).eq("merchant_id", m.id),
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", m.id)
      .eq("status", "success"),
    service
      .from("merchant_transactions")
      .select("id, amount, transaction_type, description, provider_reference, reference_id, created_at")
      .eq("merchant_id", m.id)
      .order("created_at", { ascending: false })
      .limit(LIMITS.ledger),
    readLedgerFeeTotals(service, { merchantIds: [m.id], window: { since: EPOCH } }),
    service
      .from("agent_tasks")
      .select("id, task_type, priority, description, is_complete, created_at, due_at")
      .eq("merchant_id", m.id)
      .order("is_complete", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(LIMITS.tasks),
    service
      .from("admin_ops_log")
      .select("id, action, target_type, target_id, details, created_at")
      .eq("target_id", m.id)
      .order("created_at", { ascending: false })
      .limit(LIMITS.audit),
    service
      .from("fraud_events")
      .select("id, event_type, severity, created_at")
      .eq("merchant_id", m.id)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(10),
    service
      .from("pending_topups")
      .select("api_ref, amount, currency, status, payment_provider, created_at")
      .eq("merchant_id", m.id)
      .order("created_at", { ascending: false })
      .limit(LIMITS.topups),
  ]);

  // ---- Derived facts ------------------------------------------------------
  const blocker = publicMerchantBlocker({
    status: m.status,
    isVisible: m.is_visible !== false,
    isShadowBanned: m.is_shadow_banned === true,
  });
  const evidence = classifyMerchant(m.id);
  const cohort = cohortEntry(m.id);

  type DealRow = {
    id: string;
    title: string;
    deal_type: string;
    is_active: boolean;
    is_paused: boolean;
    is_demo: boolean;
    boost_active: boolean;
    max_claims: number | null;
    claims_count: number;
    claims_reserved: number;
    expires_at: string | null;
    created_at: string;
  };
  const deals = (dealsRes.data ?? []) as unknown as DealRow[];
  const dealStates = deals.map((d) => ({ d, state: adminDealState(d, now) }));
  const activeDeals = deals.filter((d) => d.is_active).length;
  const liveDeals = dealStates.filter((x) => x.state === "live").length;
  const pausedDeals = dealStates.filter((x) => x.state === "paused").length;
  const dealCap = activeDealLimit(tier);

  type RedemptionRow = {
    id: string;
    status: string;
    claimed_at: string | null;
    arrived_at: string | null;
    redeemed_at: string;
    expires_at: string;
    user_id: string;
    deals: { title: string } | null;
    users: { full_name: string | null } | null;
    merchant_presentations: { status: string; expires_at: string }[] | null;
  };
  const redemptions = (redemptionsRes.data ?? []) as unknown as RedemptionRow[];
  const stages = countStages(redemptions, now);

  type LedgerRow = {
    id: string;
    amount: number | string;
    transaction_type: string;
    description: string | null;
    provider_reference: string | null;
    reference_id: string | null;
    created_at: string;
  };
  const ledger = (ledgerRes.data ?? []) as unknown as LedgerRow[];
  const openingCredit = ledgerRes.error ? null : openingCreditAmount(ledger.map((r) => ({ ...r, amount: r.amount })));

  const tasks = tasksRes.data ?? [];
  const openTasks = tasks.filter((t) => !t.is_complete);
  const n = (r: { count: number | null; error: unknown }) => (r.error ? null : r.count ?? 0);
  const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString());

  const sectionCls = "mt-8 scroll-mt-6";
  const h2 = "text-base font-bold text-ink";

  return (
    <main className="max-w-4xl">
      <Link href="/admin/merchants" className="text-sm font-semibold text-secondary hover:text-ink">
        ← Merchants
      </Link>

      {/* ---- Header --------------------------------------------------------- */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink">{m.merchant_name}</h1>
        <StatusChip status={m.status} />
        <PlanChip plan={tier} />
        {m.is_demo ? <StatusChip status="draft" label="Synthetic" /> : null}
        {m.is_featured ? <StatusChip status="current" label="Featured" /> : null}
        {m.is_shadow_banned ? <StatusChip status="flagged" label="Shadow-banned" /> : null}
        {m.is_visible === false ? <StatusChip status="paused" label="Hidden" /> : null}
      </div>
      <p className="mt-1 text-sm text-muted">
        {nodeLabel(m.node)} · {[m.floor, m.unit_number].filter(Boolean).join(", ") || "no floor/unit"} ·
        joined {friendlyTime(m.created_at, now)}
        {m.onboarded_at ? ` · activated ${friendlyTime(m.onboarded_at, now)}` : " · not yet activated"}
      </p>

      {/* One-line diagnosis: can a shopper reach this shop at all? */}
      <div className="mt-3 rounded-card bg-white px-4 py-3 shadow-card">
        {blocker === null ? (
          <p className="text-sm text-ink">
            <IconCheck aria-hidden className="mr-1.5 inline h-4 w-4 text-verified" />
            Reachable by shoppers — active, visible, not shadow-banned.{" "}
            {/* A failed deals read is unknown, never "no live deal" (D164 / D185). */}
            {dealsRes.error ? (
              <>Live-deal count could not be read — unknown, not zero.</>
            ) : liveDeals === 0 ? (
              <strong className="font-semibold">No live deal, so nothing can be claimed right now.</strong>
            ) : (
              <>{liveDeals} live {liveDeals === 1 ? "deal" : "deals"} claimable.</>
            )}
          </p>
        ) : (
          <p className="text-sm text-ink">
            <strong className="font-semibold">Not reachable by shoppers.</strong>{" "}
            {blocker === "status"
              ? `Status is ${m.status}, not active.`
              : blocker === "is_visible"
                ? "Hidden: the trust metric dropped below 0.50 and the database hid the shop. No console control lifts this."
                : "Shadow-banned by an admin: deals look live to the merchant and reach nobody."}
          </p>
        )}
      </div>

      {/* Section index */}
      <nav aria-label="Sections" className="mt-4 flex flex-wrap gap-2 text-xs">
        {[
          ["identity", "Identity"],
          ["staff", "Staff"],
          ["deals", "Deals"],
          ["activity", "Shopper activity"],
          ["economics", "Economics"],
          ["support", "Support"],
          ["actions", "Admin actions"],
          ["audit", "Audit"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full bg-cream px-3 py-1 font-semibold text-muted hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      {/* ---- Identity ------------------------------------------------------- */}
      <section id="identity" className={sectionCls}>
        <h2 className={h2}>Identity</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Row label="Status" value={m.status} />
          <Row label="Plan" value={trialStatus ?? planLabel(tier)} />
          <Row label="Approval" value={m.status === "pending" ? "Awaiting admin approval" : m.onboarded_at ? `Activated ${friendlyTime(m.onboarded_at, now)}` : m.status === "active" ? "Active (activation time not recorded)" : "—"} />
          <Row label="Trust metric" value={Number(m.trust_metric).toFixed(2)} />
          {/* D158 — phone may be NULL for a shop onboarded on a verified email. */}
          <Row label="Phone" value={m.phone ?? "none on file"} />
          <Row label="Email" value={m.email ?? "none on file"} />
          <Row label="WhatsApp" value={m.whatsapp ?? "—"} />
          <Row
            label="Evidence class"
            value={`${evidenceClassLabel(evidence)}${cohort?.position ? ` · Merchant ${String(cohort.position).padStart(2, "0")}` : ""}`}
          />
        </div>
        {cohort ? (
          <p className="mt-2 text-xs text-muted">{cohort.source}</p>
        ) : m.is_demo ? (
          <p className="mt-2 text-xs text-muted">Synthetic merchant from the demo seed. Never evidence.</p>
        ) : (
          <p className="mt-2 text-xs text-muted">
            Not named in the Node 0 cohort manifest, so this merchant is <strong className="font-semibold">unclassified</strong>:
            genuine-tagged if its data says so, never counted as external field validation until a
            founder adds it to <code className="text-[11px]">lib/pilot-cohort.ts</code>.
          </p>
        )}
        {trialStatus ? (
          <p className="mt-2 text-sm font-semibold text-ink" data-testid="admin-trial-status">
            {trialStatus}
            {m.trial_ends_at ? (
              <span className="ml-2 font-normal text-muted">trial ends {new Date(m.trial_ends_at).toLocaleDateString()}</span>
            ) : null}
            {m.grace_period_ends_at ? (
              <span className="ml-2 font-normal text-muted">· grace ends {new Date(m.grace_period_ends_at).toLocaleDateString()}</span>
            ) : null}
          </p>
        ) : m.elite_trial_granted_at ? (
          <p className="mt-2 text-xs text-muted" data-testid="admin-trial-slot-consumed">
            Launch-offer trial slot consumed {new Date(m.elite_trial_granted_at).toLocaleDateString()} (not currently on trial)
          </p>
        ) : null}

        <div className="mt-3 inline-flex items-center gap-2 rounded-card bg-cream px-4 py-3 text-sm text-ink">
          <IconCheck className="h-4 w-4 text-verified" />
          {/* D162 — coordinates are the canonical location and what3words is
              optional, so a shop can legitimately have GPS and no words. */}
          {m.what3words_address ? (
            <>
              w3w resolved: <W3wChip address={m.what3words_address} />
            </>
          ) : typeof m.lat === "number" && typeof m.lng === "number" ? (
            <span className="tnum">Located: {m.lat.toFixed(5)}, {m.lng.toFixed(5)}</span>
          ) : (
            <span>No location on file</span>
          )}
          {m.entrance_notes ? <span className="text-muted">— {m.entrance_notes}</span> : null}
        </div>
        <MerchantLocationForm
          merchantId={m.id}
          initialW3w={m.what3words_address ?? ""}
          initialLat={typeof m.lat === "number" ? m.lat : null}
          initialLng={typeof m.lng === "number" ? m.lng : null}
        />
      </section>

      {/* ---- Staff ---------------------------------------------------------- */}
      <section id="staff" className={sectionCls}>
        <h2 className={h2}>Staff seats</h2>
        <p className="mt-1 text-xs text-muted">
          The owner can always verify. A seat verifies at the counter only once an account has
          linked to it — a verified phone or email matching the invite.
        </p>
        {staffRes.error ? (
          <div className="mt-2"><AdminReadError what="staff seats" /></div>
        ) : (staffRes.data ?? []).length === 0 ? (
          <p className="mt-2 rounded-card bg-white px-4 py-4 text-sm text-muted shadow-card">
            No staff seats. Only the owner can verify at this counter.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {(staffRes.data ?? []).map((s) => {
              const perms = [
                s.can_verify && "Verify",
                s.can_deals && "Deals",
                s.can_topup && "Top up",
                s.can_purchase && "Purchase",
              ].filter(Boolean);
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-card bg-white px-4 py-3 shadow-card">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{s.staff_name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {maskPhone(s.phone) ?? s.email ?? "no contact"} · {perms.join(" · ") || "no permissions"} · invited {relativeAgo(s.invited_at, now)}
                    </p>
                  </div>
                  {s.user_id ? (
                    <StatusChip status="active" label="Linked" />
                  ) : (
                    <StatusChip status="pending" label="Not linked" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Deals ---------------------------------------------------------- */}
      <section id="deals" className={sectionCls}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={h2}>Deals</h2>
          <span className="text-xs text-muted">
            {dealsRes.error
              ? "deal counts unavailable"
              : `${activeDeals}/${dealCap} active slots · ${liveDeals} live · ${pausedDeals} paused`}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Claim allocation is the number of shopper claims that may be issued (D236), not a
          redemption limit. Pausing and allocation are the merchant&apos;s controls; the console
          can only remove a deal.
        </p>
        {dealsRes.error ? (
          <div className="mt-2"><AdminReadError what="this merchant's deals" /></div>
        ) : deals.length === 0 ? (
          <p className="mt-2 rounded-card bg-white px-4 py-4 text-sm text-muted shadow-card">
            No deals have ever been created.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {dealStates.map(({ d, state }) => {
              const alloc = claimAllocation({ maxClaims: d.max_claims, claimsReserved: d.claims_reserved });
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-card bg-white px-4 py-3 shadow-card">
                  <DealStateChip state={state} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">
                      {d.title}
                      {d.is_demo ? <span className="ml-2 text-[11px] uppercase text-muted">synthetic</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {d.deal_type === "flash" ? "Flash" : "Standard"}
                      {d.boost_active ? " · Boosted" : ""}
                      {d.expires_at ? ` · ${state === "expired" || state === "in_grace" ? "expired" : "expires"} ${friendlyTime(d.expires_at, now)}` : ""}
                    </p>
                  </div>
                  <div className="tnum text-right text-xs text-ink">
                    <span className="block">{CLAIM_ALLOCATION_LABELS.allocation}: {alloc.allocation === null ? CLAIM_ALLOCATION_LABELS.uncapped : alloc.allocation}</span>
                    <span className="block text-muted">{claimAllocationLine(alloc)} · redeemed {d.claims_count}</span>
                  </div>
                </div>
              );
            })}
            {deals.length >= LIMITS.deals ? (
              <p className="text-xs text-muted">Showing the {LIMITS.deals} newest deals; older ones are not listed.</p>
            ) : null}
          </div>
        )}
      </section>

      {/* ---- Shopper activity ---------------------------------------------- */}
      <section id="activity" className={sectionCls}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={h2}>Shopper activity</h2>
          <Link href={`/admin/visits?merchant=${m.id}&window=30`} className="text-sm font-semibold text-secondary hover:text-ink">
            Funnel for this merchant →
          </Link>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Claims (all time)" value={fmt(n(claimsAllRes))} hint="Every code ever issued at this shop." />
          <KpiCard label="Redeemed (all time)" value={fmt(n(successAllRes))} hint="Verified by staff — the only money event." />
          <KpiCard
            label="Held now"
            value={redemptionsRes.error ? "—" : stages.held.toLocaleString()}
            hint="Of the recent claims below. A dash is a failed read, never zero."
          />
          <KpiCard
            label="In queue now"
            value={redemptionsRes.error ? "—" : stages.in_queue.toLocaleString()}
            hint="On the staff queue at this moment."
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          A claim is not an arrival, an arrival is not a redemption, and a queue entry is not a
          redemption. The {redemptions.length} most recent claims, each in exactly one state:
        </p>
        {redemptionsRes.error ? (
          <div className="mt-2"><AdminReadError what="this merchant's claims" /></div>
        ) : redemptions.length === 0 ? (
          <p className="mt-2 rounded-card bg-white px-4 py-4 text-sm text-muted shadow-card">No claims yet.</p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(VISIT_STAGE_META) as VisitStage[])
                .filter((s) => stages[s] > 0)
                .map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5 text-xs text-muted">
                    <VisitStageChip stage={s} />
                    <span className="tnum">{stages[s]}</span>
                  </span>
                ))}
            </div>
            <div className="mt-2 overflow-x-auto rounded-card bg-white shadow-card">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-semibold">State</th>
                    <th className="px-3 py-2 font-semibold">Deal</th>
                    <th className="px-3 py-2 font-semibold">Shopper</th>
                    <th className="px-3 py-2 font-semibold">Claimed</th>
                    <th className="px-3 py-2 font-semibold">Arrived</th>
                    <th className="px-3 py-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r) => (
                    <tr key={r.id} className="border-b border-line/60 align-top last:border-0">
                      <td className="px-3 py-2"><VisitStageChip stage={visitStage(r, now)} /></td>
                      <td className="px-3 py-2 text-xs text-ink">{r.deals?.title ?? "Deal removed"}</td>
                      <td className="px-3 py-2 text-xs">
                        <Link href={`/admin/customers/${r.user_id}`} className="text-ink underline-offset-2 hover:underline">
                          {r.users?.full_name ?? "Unnamed account"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">{r.claimed_at ? friendlyTime(r.claimed_at, now) : "before tracking"}</td>
                      <td className="px-3 py-2 text-xs text-muted">{r.arrived_at ? friendlyTime(r.arrived_at, now) : "no check-in"}</td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/admin/redemptions/${r.id}`} className="text-xs font-semibold text-secondary hover:text-ink">Open</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {fraudRes.error ? (
          <div className="mt-2"><AdminReadError what="fraud signals for this merchant" /></div>
        ) : (fraudRes.data ?? []).length > 0 ? (
          <p className="mt-2 rounded-card border border-flame/50 bg-white px-4 py-3 text-sm text-ink shadow-card">
            <strong className="font-semibold">{(fraudRes.data ?? []).length} unresolved fraud {(fraudRes.data ?? []).length === 1 ? "signal" : "signals"}</strong>{" "}
            ({(fraudRes.data ?? []).map((e) => `${e.event_type} · ${e.severity}`).join(", ")}). Resolve on{" "}
            <Link href="/admin/redemptions" className="underline">Guardian &amp; fraud review</Link>.
          </p>
        ) : null}
      </section>

      {/* ---- Economics ------------------------------------------------------ */}
      <section id="economics" className={sectionCls}>
        <h2 className={h2}>Economics</h2>
        <p className="mt-1 text-xs text-muted">
          Money is read from the ledger, never from a claim&apos;s own fee column. Fees are
          all-time, gross / reversals / net, through the one shared reader.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Wallet balance" value={formatKes(m.account_balance)} />
          <KpiCard
            label="Arrears outstanding"
            value={formatKes(m.outstanding_arrears)}
            hint={Number(m.outstanding_arrears) > 0 ? "Fees recorded that the wallet could not cover; settles from the next top-up." : undefined}
          />
          <KpiCard
            label="Opening credit"
            value={ledgerRes.error ? "—" : openingCredit === null ? "None" : formatKes(openingCredit)}
            hint="Credited once on activation at the launch node. Nobody raises the wall with the merchant."
          />
          <KpiCard label={`${FEE_FIGURE_LABELS.net} (all time)`} value={feeFigure(feesAllTime.netKes)} />
          <KpiCard label={FEE_FIGURE_LABELS.gross} value={feeFigure(feesAllTime.grossKes)} />
          <KpiCard label={FEE_FIGURE_LABELS.reversals} value={feeFigure(feesAllTime.reversalsKes)} />
        </div>
        {Number(m.account_balance) <= 0 && m.status === "active" ? (
          <p className="mt-2 rounded-card bg-white px-4 py-3 text-xs text-ink shadow-card">
            <strong className="font-semibold">Zero balance.</strong> The zero-balance gate stops new deals; existing deals keep
            running and fees go to arrears. Do <strong className="font-semibold">not</strong> raise this with the merchant —
            what they say about it unprompted is the measurement (ruling 2026-08-24).
          </p>
        ) : null}
        <h3 className="mt-4 text-sm font-semibold text-ink">Ledger</h3>
        {ledgerRes.error ? (
          <div className="mt-2"><AdminReadError what="the merchant ledger" /></div>
        ) : ledger.length === 0 ? (
          <p className="mt-2 rounded-card bg-white px-4 py-4 text-sm text-muted shadow-card">No ledger movements yet.</p>
        ) : (
          <div className="mt-2 rounded-card bg-white shadow-card">
            {ledger.map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-b-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{formatMerchantLedgerLabel(t)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {t.transaction_type.replace(/_/g, " ")} · {friendlyTime(t.created_at, now)}
                    {isOpeningCredit(t) ? " · opening credit" : ""}
                    {t.reference_id && t.transaction_type.startsWith("success_fee") ? (
                      <>
                        {" · "}
                        <Link href={`/admin/redemptions/${t.reference_id}`} className="underline">redemption</Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <span className="tnum ml-3 shrink-0 text-sm font-bold text-ink">{formatKesSigned(t.amount)}</span>
              </div>
            ))}
            {ledger.length >= LIMITS.ledger ? (
              <p className="px-4 py-2 text-xs text-muted">Showing the {LIMITS.ledger} most recent movements.</p>
            ) : null}
          </div>
        )}
        {topupsRes.error ? (
          <div className="mt-2"><AdminReadError what="pending top-ups" /></div>
        ) : (topupsRes.data ?? []).some((t) => t.status === "initiated") ? (
          <div className="mt-2 rounded-card bg-white px-4 py-3 shadow-card">
            <p className="text-sm font-semibold text-ink">Top-ups not yet confirmed</p>
            {(topupsRes.data ?? []).filter((t) => t.status === "initiated").map((t) => (
              <p key={t.api_ref} className="mt-0.5 text-xs text-muted">
                {t.currency} <span className="tnum text-ink">{Math.round(Number(t.amount)).toLocaleString()}</span> via {t.payment_provider} · initiated {relativeAgo(t.created_at, now)} · no money credited
              </p>
            ))}
          </div>
        ) : null}
      </section>

      {/* ---- Support -------------------------------------------------------- */}
      <section id="support" className={sectionCls}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={h2}>Support</h2>
          <Link
            href={`/admin/support/new?merchant=${m.id}`}
            className="rounded-full border border-ink bg-white px-4 py-1.5 text-xs font-semibold text-ink hover:bg-cream"
          >
            Log an issue
          </Link>
        </div>
        {tasksRes.error ? (
          <div className="mt-2"><AdminReadError what="support history" /></div>
        ) : tasks.length === 0 ? (
          <p className="mt-2 rounded-card bg-white px-4 py-4 text-sm text-muted shadow-card">No support history.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {tasks.map((t) => {
              const overdue = !t.is_complete && t.due_at && new Date(t.due_at) < now;
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-card bg-white px-4 py-3 shadow-card">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold capitalize text-ink">
                      {t.task_type.replace(/_/g, " ")} · <span className="font-normal text-muted">{t.priority}</span>
                      {overdue ? <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-ink">overdue</span> : null}
                    </p>
                    {t.description ? <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted">{t.description}</p> : null}
                    <p className="mt-0.5 text-[11px] text-faint">
                      opened {relativeAgo(t.created_at, now)}
                      {t.due_at ? ` · due ${friendlyTime(t.due_at, now)}` : ""}
                    </p>
                  </div>
                  {t.is_complete ? <StatusChip status="ended" label="Resolved" /> : <OverrideButton taskId={t.id} />}
                </div>
              );
            })}
          </div>
        )}
        {openTasks.length > 0 ? (
          <p className="mt-2 text-xs text-muted">Override completes a task and appends an audit line to it.</p>
        ) : null}
      </section>

      {/* ---- Admin actions -------------------------------------------------- */}
      <section id="actions" className={sectionCls}>
        <h2 className={h2}>Admin actions</h2>
        <p className="mt-1 text-xs text-muted">
          Only what the backend enforces. Every action here is written to the audit trail.
        </p>
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
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-semibold text-muted">Plan:</span>
          <PlanActions merchantId={m.id} tier={tier} onTrial={m.elite_trial_active === true} />
        </div>
        <p className="mt-3 text-xs text-muted">
          Not available from the console, by design: pausing or re-allocating a deal (merchant-only,
          D231) and lifting a trust-metric hide (database-owned, D233). Blocking a shopper from new
          claims is done from the shopper&apos;s own account page (D232), never from here.
        </p>
      </section>

      {/* ---- Audit ---------------------------------------------------------- */}
      <section id="audit" className={sectionCls}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={h2}>Audit</h2>
          <Link href="/admin/audit" className="text-sm font-semibold text-secondary hover:text-ink">Full audit</Link>
        </div>
        <p className="mt-1 text-xs text-muted">Admin mutations recorded against this merchant.</p>
        {auditRes.error ? (
          <div className="mt-2"><AdminReadError what="the audit trail for this merchant" /></div>
        ) : (auditRes.data ?? []).length === 0 ? (
          <p className="mt-2 rounded-card bg-white px-4 py-4 text-sm text-muted shadow-card">No admin actions recorded for this merchant.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {(auditRes.data ?? []).map((e) => (
              <div key={e.id} className="rounded-card bg-white px-4 py-2.5 shadow-card">
                <p className="text-sm font-semibold text-ink">{e.action}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {friendlyTime(e.created_at, now)}
                  {e.details && Object.keys(e.details as object).length > 0 ? ` · ${JSON.stringify(e.details)}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-card bg-white px-4 py-2.5 shadow-card">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-right text-sm font-semibold capitalize text-ink">{value}</span>
    </div>
  );
}
