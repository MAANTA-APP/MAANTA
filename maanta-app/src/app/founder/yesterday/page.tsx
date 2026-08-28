import Link from "next/link";
import { requireFounderPage } from "@/lib/founder";
import { canAccessAdminConsole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminReadError } from "@/components/admin/read-error";
import { KpiCard } from "@/components/ui/cards";
import { readDemoModeEnabled } from "@/lib/demo-mode";
import {
  GENUINE_JOIN_SELECT,
  genuineJoinSelect,
  genuineTagged,
  sumSuccessFees,
  FEE_ROW_CAP,
  type SuccessFeeRow,
} from "@/lib/evidence-scope";
import { withPublicMerchant } from "@/lib/data";
import { externalCohortSize, internalMerchantIds } from "@/lib/pilot-cohort";
import { queueAlertState } from "@/lib/pilot-command-centre";
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
  // The guard returns the user because this page links into /admin/pilot, which
  // a cofounder cannot open. Founder-dashboard access and admin-console access
  // are different rules (lib/roles.ts), and rendering the link for everyone
  // would hand cofounders a dead link that redirects them off the page they
  // were reading. Same pattern as the Operations block on /founder.
  const user = await requireFounderPage();
  const canOpenAdminConsole = canAccessAdminConsole(user.role);

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
    // Shopper-visible must mean what the FEED means. The deal-side conditions
    // are only half of it: a deal on a suspended, hidden or shadow-banned
    // merchant reaches nobody, so counting it inflated supply AND suppressed
    // the no-supply alert for exactly the merchants most needing it.
    // withPublicMerchant() is the helper the shopper surfaces use, so this
    // count cannot drift from the feed — demo handling included.
    withPublicMerchant(
      service
        .from("deals")
        .select("id, merchants!inner(status,is_visible,is_shadow_banned,is_demo)", {
          count: "exact",
          head: true,
        })
        .eq("is_active", true)
        .eq("is_paused", false)
        .gt("expires_at", new Date().toISOString()),
      { includeDemo: demoMode.enabled }
    ),
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
    // Fees, scoped to the SAME evidence as the counts beside them.
    //
    // This read merchant_transactions by type alone, so a fee charged against a
    // demo merchant landed under a heading whose other figures are
    // genuine-tagged — a mixed number sitting beside filtered ones, which is
    // the D188 conflation in money form. Derived instead from the genuine
    // verified redemptions themselves: each success carries the fee it was
    // charged, and the redemption chain is what makes it genuine.
    genuineTagged(
      service
        .from("redemptions")
        .select(genuineJoinSelect("success_fee_charged"))
        .eq("status", "success")
        .gte("redeemed_at", startIso)
        .lt("redeemed_at", endIso)
        .limit(FEE_ROW_CAP)
    ),
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

  // Shared with /admin/pilot: one definition of "a failed or truncated fee read
  // is unavailable, never zero", tested by forcing each input directly rather
  // than by scanning this file for a shape.
  const fees = sumSuccessFees(
    feesRes.error ? null : ((feesRes.data ?? []) as unknown as SuccessFeeRow[])
  );

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

  // The alert queues are in here as well as rendering their own unavailable
  // rows: no "all clear" reading of this page may rest on a failed queue read.
  const readFailures = [
    merchantsLiveRes,
    claimsRes,
    verifiedRes,
    arrivalsRes,
    fastVisitsRes,
    heldRes,
    pendingRes,
    openTasksRes,
  ].filter((r) => (r as { error?: unknown }).error).length;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink">Yesterday</h1>
        {canOpenAdminConsole ? (
          <Link href="/admin/pilot" className="text-xs font-semibold text-ink underline">
            Pilot command centre →
          </Link>
        ) : null}
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
          hint="KES 30 per verified redemption, genuine-tagged only — the same evidence scope as the counts above."
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
            count={n(heldRes)}
            noun={(c) => `${c} flagged redemption${c === 1 ? "" : "s"}`}
            reason="Guardian has redemptions waiting for a human decision."
            href="/admin/redemptions"
            canOpenAdminConsole={canOpenAdminConsole}
          />
          <Alert
            count={n(pendingRes)}
            noun={(c) => `${c} merchant${c === 1 ? "" : "s"} awaiting approval`}
            reason="Merchant onboarding cannot complete until an admin reviews them."
            href="/admin/approvals"
            canOpenAdminConsole={canOpenAdminConsole}
          />
          <Alert
            count={n(openTasksRes)}
            noun={(c) => `${c} open support task${c === 1 ? "" : "s"}`}
            reason="Operational tasks are still marked incomplete."
            href="/admin/support"
            canOpenAdminConsole={canOpenAdminConsole}
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

/**
 * One queue alert, driven by a NULLABLE count.
 *
 * The first draft took a boolean computed as `(count ?? 0) > 0`, which made a
 * failed read collapse to zero and the alert vanish — so an unreadable queue of
 * flagged redemptions rendered as an all-clear. That is D164/D185 inverted and
 * it is worse here than on a KPI: a silent alert is an operator deciding there
 * is nothing to do.
 *
 * Three states, never two: a genuine zero renders nothing, a positive count
 * renders the alert, and an unreadable count renders an explicit unavailable
 * row that says the queue could not be read.
 */
/**
 * One unresolved-queue alert.
 *
 * `canOpenAdminConsole` is required, not optional, and that is deliberate.
 * `requireFounderPage` admits `admin` AND `cofounder`, but every `href` here
 * points into `/admin/*`, which `requireAdminPage` admits admins only — so for
 * a cofounder these links silently bounce to `/` and off the brief they were
 * reading. The pilot link above was gated last round and these three were not;
 * making the prop required means a fourth alert cannot be added without
 * deciding the question.
 *
 * A cofounder still sees the alert, with the same count and reason — the queue
 * is real and they need to know it exists. Only the navigation is withheld,
 * with a line naming what it would take to act on it. Hiding the alert instead
 * would be the failure this whole page exists to prevent: an operator reading
 * silence as an all-clear.
 */
function Alert({
  count,
  noun,
  reason,
  href,
  canOpenAdminConsole,
}: {
  count: number | null;
  /** Singular noun for the queue, e.g. "redemption flagged". */
  noun: (n: number) => string;
  reason: string;
  href: string;
  canOpenAdminConsole: boolean;
}) {
  const state = queueAlertState(count);
  // `count === null` is redundant with the state check and present so
  // TypeScript narrows `count` to a number below; queueAlertState stays the
  // single decision-maker, and its tests are what prove the three states.
  if (state === "unavailable" || count === null) {
    return (
      <li role="alert" className="rounded-card bg-white px-4 py-3 shadow-card">
        <p className="text-sm font-semibold text-ink">
          {noun(0).replace(/^\d+\s*/, "")} — unavailable
        </p>
        <p className="mt-0.5 text-xs text-muted">
          This queue could not be read, so it is unknown, not clear. Do not treat
          the absence of an alert here as an all-clear.
        </p>
      </li>
    );
  }
  if (state === "silent") return null;
  return (
    <li className="rounded-card bg-white px-4 py-3 shadow-card">
      {canOpenAdminConsole ? (
        <Link
          href={href}
          className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
        >
          {noun(count)}
        </Link>
      ) : (
        <p className="text-sm font-semibold text-ink">{noun(count)}</p>
      )}
      <p className="mt-0.5 text-xs text-muted">{reason}</p>
      {canOpenAdminConsole ? null : (
        <p className="mt-0.5 text-xs text-muted">
          Resolving this needs the admin console, which this role cannot open.
        </p>
      )}
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
    const { count, error: dealErr } = await withPublicMerchant(
      service
        .from("deals")
        .select("id, merchants!inner(status,is_visible,is_shadow_banned,is_demo)", {
          count: "exact",
          head: true,
        })
        .eq("merchant_id", m.id)
        .eq("is_active", true)
        .eq("is_paused", false)
        .gt("expires_at", new Date().toISOString()),
      { includeDemo: demoMode.enabled }
    );
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
