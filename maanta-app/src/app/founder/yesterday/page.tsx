import Link from "next/link";
import { requireFounderPage } from "@/lib/founder";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminReadError } from "@/components/admin/read-error";
import { KpiCard } from "@/components/ui/cards";
import { readDemoModeEnabled } from "@/lib/demo-mode";
import { GENUINE_JOIN_SELECT, genuineJoinSelect, genuineTagged } from "@/lib/evidence-scope";
import { externalCohortSize, internalMerchantIds } from "@/lib/pilot-cohort";
import { formatKes } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * Yesterday — the founder's daily operating brief.
 *
 * One screen answering "what actually happened yesterday", derived entirely
 * from rows that already exist. Read-only: it writes nothing and changes no
 * commercial behaviour.
 *
 * ## Why yesterday and not "today"
 *
 * A partial day invites false trends — 2 claims by 10am reads as a bad day
 * until 6pm. The window is the previous full day in **Nairobi time** (UTC+3),
 * which is the day the mall actually traded, not the server's UTC day. The
 * boundary is stated on the page so no reader has to guess it.
 *
 * ## What it refuses to do
 *
 * - No scoring, ranking or prediction. Every alert names the condition that
 *   fired.
 * - No rates. At Node 0 volumes a percentage is noise wearing a suit, so this
 *   page shows counts and a comparison against the day before — a difference,
 *   not a trend, and never a cause.
 * - No zero that is really an error. Each figure is nullable to the cell and
 *   renders "—" when its read failed (D164 / D185).
 * - No conflation of evidence classes. Genuine-tagged (D188) is reported apart
 *   from demo/mixed, and external field validation comes only from the cohort
 *   manifest — never inferred from a non-demo flag.
 */
export default async function YesterdayBriefPage() {
  await requireFounderPage();

  const { startIso, endIso, prevStartIso, label } = nairobiYesterday();
  const service = createServiceClient();
  const demoMode = await readDemoModeEnabled();
  const internalIds = internalMerchantIds();

  const claimsIn = (from: string, to: string) =>
    genuineTagged(
      service
        .from("redemptions")
        .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
        .gte("claimed_at", from)
        .lt("claimed_at", to)
    );
  const verifiedIn = (from: string, to: string) =>
    genuineTagged(
      service
        .from("redemptions")
        .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
        .eq("status", "success")
        .gte("redeemed_at", from)
        .lt("redeemed_at", to)
    );

  const [
    merchantsLiveRes,
    visibleDealsRes,
    claimsRes,
    claimsPrevRes,
    arrivalsRes,
    verifiedRes,
    verifiedPrevRes,
    fastVisitsRes,
    feesRes,
    allClaimsRes,
    allVerifiedRes,
    heldRes,
    openTasksRes,
    pendingRes,
  ] = await Promise.all([
    service
      .from("merchants")
      .select("id", { count: "exact", head: true })
      .eq("is_demo", false)
      .eq("status", "active"),
    (() => {
      let q = service
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("is_paused", false)
        .gt("expires_at", new Date().toISOString());
      if (demoMode.ok && !demoMode.enabled) q = q.eq("is_demo", false);
      return q;
    })(),
    claimsIn(startIso, endIso),
    claimsIn(prevStartIso, startIso),
    genuineTagged(
      service
        .from("redemptions")
        .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
        .not("arrived_at", "is", null)
        .gte("arrived_at", startIso)
        .lt("arrived_at", endIso)
    ),
    verifiedIn(startIso, endIso),
    verifiedIn(prevStartIso, startIso),
    genuineTagged(
      service
        .from("redemptions")
        .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
        .not("fast_visit_qualified_at", "is", null)
        .gte("fast_visit_qualified_at", startIso)
        .lt("fast_visit_qualified_at", endIso)
    ),
    service
      .from("merchant_transactions")
      .select("amount")
      .eq("transaction_type", "success_fee")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .limit(FEE_ROW_CAP),
    // Every claim yesterday, genuine-tagged or not. The difference between this
    // and the genuine count is the demo/mixed split — stated, not hidden.
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .gte("claimed_at", startIso)
      .lt("claimed_at", endIso),
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "success")
      .gte("redeemed_at", startIso)
      .lt("redeemed_at", endIso),
    // 'flagged', not 'held': that is the status the guardian sets and the one
    // /admin already counts. A guessed value would have errored into a dash and
    // quietly hidden a real queue.
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "flagged"),
    service
      .from("agent_tasks")
      .select("id", { count: "exact", head: true })
      .eq("is_complete", false),
    service
      .from("merchants")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const n = (r: { count: number | null; error: unknown }) =>
    r.error ? null : r.count ?? 0;

  const claims = n(claimsRes);
  const claimsPrev = n(claimsPrevRes);
  const verified = n(verifiedRes);
  const verifiedPrev = n(verifiedPrevRes);
  const arrivals = n(arrivalsRes);
  const fastVisits = n(fastVisitsRes);
  const allClaims = n(allClaimsRes);
  const allVerified = n(allVerifiedRes);
  const merchantsLive = n(merchantsLiveRes);
  const visibleDeals = demoMode.ok ? n(visibleDealsRes) : null;

  const feeRows = feesRes.error ? null : feesRes.data ?? [];
  const fees =
    feeRows === null || feeRows.length >= FEE_ROW_CAP
      ? null
      : feeRows.reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0);

  const demoClaims =
    allClaims === null || claims === null ? null : Math.max(0, allClaims - claims);
  const demoVerified =
    allVerified === null || verified === null
      ? null
      : Math.max(0, allVerified - verified);

  // Merchants that could not have been claimed from, and merchants that were
  // claimed from but nobody arrived at. Both are deterministic list queries,
  // not inferences.
  const [zeroSupply, claimedNotVerified] = await Promise.all([
    merchantsWithoutVisibleSupply(service, demoMode),
    merchantsClaimedButNotVerified(service, startIso, endIso),
  ]);

  const readFailures = [
    merchantsLiveRes,
    claimsRes,
    verifiedRes,
    arrivalsRes,
    fastVisitsRes,
  ].filter((r) => (r as { error?: unknown }).error).length;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink">Yesterday</h1>
        <Link href="/admin/pilot" className="text-xs font-semibold text-ink underline">
          Pilot command centre →
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        {label} · Nairobi time (UTC+3) · genuine-tagged unless stated
      </p>

      {readFailures > 0 ? (
        <div className="mt-4">
          <AdminReadError
            what={`${readFailures} of yesterday's figures`}
            sub="Those figures show a dash. A dash is unknown, not zero — do not read it as a quiet day."
          />
        </div>
      ) : null}

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Merchants live"
          value={fmt(merchantsLive)}
          hint="Non-demo merchants with status active. Not the same as enrolled pilot merchants."
        />
        <KpiCard
          label="Shopper-visible deals"
          value={fmt(visibleDeals)}
          hint={
            demoMode.ok
              ? demoMode.enabled
                ? "Demo mode is ON, so synthetic deals are shopper-visible and counted here."
                : undefined
              : "Demo-mode flag unreadable, so visible supply cannot be established."
          }
        />
        <KpiCard label="Claims" value={fmt(claims)} hint={delta(claims, claimsPrev)} />
        <KpiCard
          label="Verified visits"
          value={fmt(verified)}
          hint={delta(verified, verifiedPrev)}
        />
        <KpiCard label="Arrivals / check-ins" value={fmt(arrivals)} />
        <KpiCard
          label="Fast Visits"
          value={fmt(fastVisits)}
          hint="Fast Visit is currently switched off, so this is expected to be 0."
        />
        <KpiCard
          label="Success fees"
          value={fees === null ? "—" : formatKes(fees)}
          hint="KES 30 per verified redemption."
        />
        <KpiCard
          label="External field validation"
          value={externalCohortSize().toLocaleString()}
          hint="Merchants enrolled in the Node 0 cohort manifest. Genuine-tagged activity does not add to this."
        />
      </section>

      <section className="mt-6 rounded-card bg-white px-4 py-4 shadow-card">
        <h2 className="text-sm font-semibold text-ink">Genuine / demo split</h2>
        <p className="mt-1 text-xs text-muted">
          Genuine-tagged means the redemption, its merchant and its deal are all
          non-demo (D188). `redemptions.is_demo` alone is not a discriminator —
          every claim made through the product carries it as false, including
          claims against synthetic shops.
        </p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Claims — genuine-tagged" value={fmt(claims)} />
          <Row label="Claims — demo / mixed" value={fmt(demoClaims)} />
          <Row label="Verified — genuine-tagged" value={fmt(verified)} />
          <Row label="Verified — demo / mixed" value={fmt(demoVerified)} />
        </dl>
        {internalIds.length > 0 ? (
          <p className="mt-3 text-xs text-muted">
            {internalIds.length} non-demo merchant
            {internalIds.length === 1 ? " is" : "s are"} classified internal
            (MAANTA testing itself). Their genuine-tagged activity is technical
            evidence and is not external field validation.
          </p>
        ) : null}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Unresolved operational alerts</h2>
        <ul className="mt-2 space-y-2">
          <Alert
            show={(n(heldRes) ?? 0) > 0}
            label={`${n(heldRes)} redemption(s) held`}
            reason="Guardian has redemptions waiting for a human decision."
            href="/admin/redemptions"
          />
          <Alert
            show={(n(pendingRes) ?? 0) > 0}
            label={`${n(pendingRes)} merchant(s) awaiting approval`}
            reason="Merchant onboarding cannot complete until an admin reviews them."
            href="/admin/approvals"
          />
          <Alert
            show={(n(openTasksRes) ?? 0) > 0}
            label={`${n(openTasksRes)} open support task(s)`}
            reason="Operational tasks are still marked incomplete."
            href="/admin/support"
          />
          {zeroSupply === null ? (
            <li className="rounded-card bg-white px-4 py-3 text-xs text-muted shadow-card">
              Merchants without shopper-visible supply could not be established —
              this is a read failure, not an all-clear.
            </li>
          ) : zeroSupply.length > 0 ? (
            <li className="rounded-card bg-white px-4 py-3 shadow-card">
              <p className="text-sm font-semibold text-ink">
                {zeroSupply.length} merchant{zeroSupply.length === 1 ? "" : "s"} with
                no shopper-visible supply
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Zero deals currently visible to shoppers, so no claim can be made
                at all: {zeroSupply.map((m) => m.name).join(", ")}.
              </p>
            </li>
          ) : null}
          {claimedNotVerified === null ? (
            <li className="rounded-card bg-white px-4 py-3 text-xs text-muted shadow-card">
              Claim-without-visit merchants could not be established — read
              failure, not an all-clear.
            </li>
          ) : claimedNotVerified.length > 0 ? (
            <li className="rounded-card bg-white px-4 py-3 shadow-card">
              <p className="text-sm font-semibold text-ink">
                {claimedNotVerified.length} merchant
                {claimedNotVerified.length === 1 ? "" : "s"} received claims but no
                verified visit
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Claimed yesterday and still not verified at the counter:{" "}
                {claimedNotVerified.map((m) => m.name).join(", ")}. Status is read
                as it stands now, so a claim verified this morning is already
                excluded. This is an observation about one day, not a conversion
                rate.
              </p>
            </li>
          ) : null}
        </ul>
      </section>

      <p className="mt-5 text-[11px] leading-relaxed text-muted">
        Counts, not rates. At Node 0 volumes a percentage would describe noise,
        and a day-over-day difference is a difference, never a cause. A dash
        means the figure could not be read.
      </p>
    </main>
  );
}

/** Bound on fee rows; at the cap the sum reports unavailable rather than low (D149). */
const FEE_ROW_CAP = 500;

/** Render a nullable count: a dash means unknown, never zero. */
function fmt(v: number | null): string {
  return v === null ? "—" : v.toLocaleString();
}

/**
 * Day-over-day difference, stated as a difference.
 *
 * Never a percentage and never a direction word like "up" or "improving": one
 * day against one day at these volumes cannot support either.
 */
function delta(today: number | null, prev: number | null): string | undefined {
  if (today === null || prev === null) return undefined;
  const d = today - prev;
  if (d === 0) return `Same as the day before (${prev}).`;
  return `${d > 0 ? "+" : ""}${d} vs the day before (${prev}).`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function Alert({
  show,
  label,
  reason,
  href,
}: {
  show: boolean;
  label: string;
  reason: string;
  href: string;
}) {
  if (!show) return null;
  return (
    <li className="rounded-card bg-white px-4 py-3 shadow-card">
      <Link href={href} className="text-sm font-semibold text-ink underline-offset-2 hover:underline">
        {label}
      </Link>
      <p className="mt-0.5 text-xs text-muted">{reason}</p>
    </li>
  );
}

/**
 * The previous full day in Nairobi time.
 *
 * Kenya is UTC+3 year-round with no daylight saving, so the offset is a
 * constant rather than a timezone database lookup. Returning ISO instants keeps
 * the queries in UTC while the window means the trading day.
 */
function nairobiYesterday(): {
  startIso: string;
  endIso: string;
  prevStartIso: string;
  label: string;
} {
  const OFFSET_MS = 3 * 3600_000;
  const nowNairobi = new Date(Date.now() + OFFSET_MS);
  const y = nowNairobi.getUTCFullYear();
  const m = nowNairobi.getUTCMonth();
  const d = nowNairobi.getUTCDate();
  // Midnight Nairobi today, expressed as a UTC instant.
  const todayStart = Date.UTC(y, m, d) - OFFSET_MS;
  const start = todayStart - 24 * 3600_000;
  const prevStart = start - 24 * 3600_000;
  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(todayStart).toISOString(),
    prevStartIso: new Date(prevStart).toISOString(),
    label: new Date(start + OFFSET_MS).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }),
  };
}

type NamedMerchant = { id: string; name: string };

/** Non-demo active merchants with zero shopper-visible deals right now. */
async function merchantsWithoutVisibleSupply(
  service: ReturnType<typeof createServiceClient>,
  demoMode: { ok: boolean; enabled: boolean }
): Promise<NamedMerchant[] | null> {
  if (!demoMode.ok) return null;
  const { data: merchants, error } = await service
    .from("merchants")
    .select("id, merchant_name")
    .eq("is_demo", false)
    .eq("status", "active");
  if (error) return null;

  const out: NamedMerchant[] = [];
  for (const m of merchants ?? []) {
    let q = service
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", m.id)
      .eq("is_active", true)
      .eq("is_paused", false)
      .gt("expires_at", new Date().toISOString());
    if (!demoMode.enabled) q = q.eq("is_demo", false);
    const { count, error: dealErr } = await q;
    // A failed per-merchant read must not be reported as "no supply".
    if (dealErr) return null;
    if ((count ?? 0) === 0) out.push({ id: m.id, name: m.merchant_name ?? "Unnamed" });
  }
  return out;
}

/** Merchants with genuine-tagged claims yesterday and no verified visit that day. */
async function merchantsClaimedButNotVerified(
  service: ReturnType<typeof createServiceClient>,
  startIso: string,
  endIso: string
): Promise<NamedMerchant[] | null> {
  const { data: claimed, error } = await genuineTagged(
    service
      .from("redemptions")
      .select(genuineJoinSelect("merchant_id, status", ["merchant_name"]))
      .gte("claimed_at", startIso)
      .lt("claimed_at", endIso)
  );
  if (error) return null;

  const byMerchant = new Map<string, { name: string; verified: number }>();
  for (const r of (claimed ?? []) as unknown as {
    merchant_id: string;
    status: string;
    merchants: { merchant_name: string | null } | null;
  }[]) {
    const entry = byMerchant.get(r.merchant_id) ?? {
      name: r.merchants?.merchant_name ?? "Unnamed",
      verified: 0,
    };
    if (r.status === "success") entry.verified += 1;
    byMerchant.set(r.merchant_id, entry);
  }

  return Array.from(byMerchant.entries())
    .filter(([, v]) => v.verified === 0)
    .map(([id, v]) => ({ id, name: v.name }));
}
