import Link from "next/link";
import { requireFounderPage } from "@/lib/founder";
import { canAccessAdminConsole } from "@/lib/roles";
import { LeadsReadError } from "@/components/agent/lead-row-list";
import { claimsWindow, CLAIMS_TRACKING_CONFIG_KEY } from "@/lib/claims-window";
import { OperationsLinks } from "@/components/founder/operations-links";
import { createServiceClient } from "@/lib/supabase/service";
import { HeadingLg, Body, Page, Section } from "@/components/ui/claude";
import { KpiCard } from "@/components/ui/cards";
import { NODE_0, nodeLabel } from "@/lib/nodes";
import { readDemoModeEnabled } from "@/lib/demo-mode";
import { withPublicMerchant, withPublicMerchantRows } from "@/lib/data";
import {
  GENUINE_JOIN_SELECT,
  genuineTagged,
  readLedgerFeeTotals,
  type LedgerFeeTotals,
} from "@/lib/evidence-scope";
import { FEE_FIGURE_LABELS, feeFigure } from "@/components/admin/fee-figures";
import { externalCohort, externalCohortSize, internalMerchantIds } from "@/lib/pilot-cohort";
import { MIN_CLAIMS_FOR_MERCHANT_RATIO, queueAlertState } from "@/lib/pilot-command-centre";
import {
  LADDER_RUNGS,
  KILL_CRITERION_WEEKS,
  TRIPWIRE_FLOOR,
  killCriterionClock,
  ladderPosition,
  pilotNextMove,
  tripwireReading,
} from "@/lib/founder-command-centre";

export const dynamic = "force-dynamic";

/**
 * Founder command centre — is the BBS Mall pilot actually working?
 *
 * Not another admin. The admin console operates MAANTA; this page answers
 * one question with the evidence the protocol accepts, and says what the
 * pilot sequence makes the next move. Read-only, derived entirely from rows
 * that exist, and every figure states its scope.
 *
 * ## The doctrine, in the order it is rendered
 *
 * 1. **The verdict.** External field validation — enrolled merchants and the
 *    1 → 5 → 10 ladder of genuine verified redemptions by them — is stated
 *    first and apart from everything else. It comes only from the cohort
 *    manifest (`lib/pilot-cohort.ts`); it is never inferred from a non-demo
 *    flag (D174 / D184 / D188).
 * 2. **The clocks.** The eight-week kill criterion and the claim → walk-in
 *    tripwire, each computed only when its input exists and stated as "not
 *    started" or "not computable" otherwise. A 1-of-1 is not a 100%.
 * 3. **The next move**, deterministic from the state above and the written
 *    priority sequence — never a suggestion from a model.
 * 4. **Right now** — supply and queues as a snapshot, with the demo-mode
 *    contamination warning when it applies.
 * 5. **The last seven days** — external cohort first, then every
 *    genuine-tagged merchant marketplace-wide, labelled as such.
 *
 * A failed read is a dash (D164 / D185). `/admin/*` links render only for a
 * role that can open the console; a co-founder sees the same numbers with no
 * link into a wall.
 */
export default async function FounderDashboardPage() {
  // The guard returns the user; every admin link below gates on the same role
  // read rather than assuming a founder-dashboard reader can open the console.
  const user = await requireFounderPage();
  const canOpenAdminConsole = canAccessAdminConsole(user.role);

  const service = createServiceClient();
  const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const nowIso = new Date().toISOString();
  const demoMode = await readDemoModeEnabled();
  const externalIds = externalCohort().map((e) => e.merchantId);
  const merchant01 = externalCohort()[0] ?? null;

  const genuineCount = (build: (q: ReturnType<typeof baseCount>) => ReturnType<typeof baseCount>) =>
    build(baseCount());
  const baseCount = () =>
    genuineTagged(
      service.from("redemptions").select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
    );
  const externalScoped = <T,>(q: T): T =>
    (q as { in: (c: string, v: string[]) => T }).in("merchant_id", externalIds);

  const [
    totalUsersRes,
    shoppersRes,
    merchantAccountsRes,
    merchantsLiveRes,
    visibleDealsRes,
    pendingRes,
    heldRes,
    openTasksRes,
    allClaims7dRes,
    allArrivals7dRes,
    allVerified7dRes,
    claimsTrackingRes,
  ] = await Promise.all([
    service.from("users").select("id", { count: "exact", head: true }),
    service.from("users").select("id", { count: "exact", head: true }).eq("role", "customer"),
    service
      .from("users")
      .select("id", { count: "exact", head: true })
      .in("role", ["merchant_admin", "merchant_staff"]),
    withPublicMerchantRows(
      service.from("merchants").select("id", { count: "exact", head: true })
    ),
    withPublicMerchant(
      service
        .from("deals")
        .select("id, merchants!inner(status,is_visible,is_shadow_banned,is_demo)", {
          count: "exact",
          head: true,
        })
        .eq("is_active", true)
        .eq("is_paused", false)
        .gt("expires_at", nowIso),
      { includeDemo: demoMode.enabled }
    ),
    service.from("merchants").select("id", { count: "exact", head: true }).eq("status", "pending"),
    service.from("redemptions").select("id", { count: "exact", head: true }).eq("status", "flagged"),
    service.from("agent_tasks").select("id", { count: "exact", head: true }).eq("is_complete", false),
    genuineCount((q) => q.gte("claimed_at", since7d)),
    genuineCount((q) => q.gte("arrived_at", since7d)),
    genuineCount((q) => q.eq("status", "success").gte("redeemed_at", since7d)),
    // D164: when claim tracking started, so the Claims card can say whether its
    // window is fully covered. A missing row is a legitimate state, not a read
    // failure, and is deliberately excluded from the guard below.
    service
      .from("app_config")
      .select("value")
      .eq("key", CLAIMS_TRACKING_CONFIG_KEY)
      .maybeSingle(),
  ]);

  // The ladder's own population: enrolled external merchants, and nobody else.
  // With nobody enrolled every figure is 0 by construction — a true zero, not
  // an unread one — and no query is made.
  const external = externalIds.length === 0
    ? {
        ladder: 0,
        claimsAllTime: 0,
        claims7d: 0,
        arrivals7d: 0,
        verified7d: 0,
        fees7d: { grossKes: 0, reversalsKes: 0, netKes: 0 } as LedgerFeeTotals,
      }
    : await (async () => {
        const [ladderRes, claimsAllRes, claims7dRes, arrivals7dRes, verified7dRes, fees7d] =
          await Promise.all([
            genuineCount((q) => externalScoped(q).eq("status", "success")),
            genuineCount((q) => externalScoped(q)),
            genuineCount((q) => externalScoped(q).gte("claimed_at", since7d)),
            genuineCount((q) => externalScoped(q).gte("arrived_at", since7d)),
            genuineCount((q) => externalScoped(q).eq("status", "success").gte("redeemed_at", since7d)),
            readLedgerFeeTotals(service, { merchantIds: externalIds, window: { since: since7d } }),
          ]);
        const n = (r: { count: number | null; error: unknown }) => (r.error ? null : r.count ?? 0);
        return {
          ladder: n(ladderRes),
          claimsAllTime: n(claimsAllRes),
          claims7d: n(claims7dRes),
          arrivals7d: n(arrivals7dRes),
          verified7d: n(verified7dRes),
          fees7d,
        };
      })();

  const allFees7d = await readLedgerFeeTotals(service, { window: { since: since7d } });

  // Same rule the agent console follows: a failed read must not render as ten
  // zeroed KPIs — "Total users: 0 · Fee revenue: KES 0" is a false statement
  // about the business, not a loading state.
  const readFailed = [
    totalUsersRes,
    shoppersRes,
    merchantAccountsRes,
    merchantsLiveRes,
    visibleDealsRes,
    pendingRes,
    heldRes,
    openTasksRes,
    allClaims7dRes,
    allArrivals7dRes,
    allVerified7dRes,
    // claimsTrackingRes is deliberately absent: a missing config row is a
    // legitimate state, not a read failure, and must not blank the dashboard.
  ].find((r) => r.error)?.error;
  if (readFailed) {
    return (
      <Page className="min-h-dvh bg-stone px-4 pb-16 pt-8">
        <HeadingLg>Founder command centre</HeadingLg>
        <div className="mt-6">
          <LeadsReadError
            what="the command centre"
            sub="This is a read error, not zeroed metrics. Reload the page; if it keeps failing, tell the Maanta team."
          />
        </div>
      </Page>
    );
  }

  const n = (r: { count: number | null; error: unknown }) => (r.error ? null : r.count ?? 0);
  const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString());
  const claims = claimsWindow(
    (claimsTrackingRes.data as { value?: string } | null)?.value ?? null
  );
  const enrolled = externalCohortSize();
  const rung = ladderPosition(external.ladder);
  const clock = killCriterionClock(merchant01?.onboardedAt ?? null, new Date());
  const tripwire = tripwireReading({
    claims: external.claimsAllTime,
    successes: external.ladder,
  });
  const nextMove = pilotNextMove({ enrolled, ladder: external.ladder });
  const pendingCount = n(pendingRes);
  const heldCount = n(heldRes);
  const tasksCount = n(openTasksRes);

  return (
    <Page className="min-h-dvh bg-stone px-4 pb-16 pt-8">
      <HeadingLg>Founder command centre</HeadingLg>
      <Body className="mt-1">
        Is the {nodeLabel(NODE_0)} pilot working? Evidence first, then the next move. Read-only.
      </Body>

      {/* ---- 1. The verdict --------------------------------------------- */}
      <Section title="External field validation" subtitle="Enrolled merchants only, from the cohort manifest. Never inferred from a non-demo flag." className="mt-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Genuine merchants"
            value={enrolled.toLocaleString()}
            hint="Real merchants who chose MAANTA and are enrolled in the Node 0 manifest. 0 until Merchant 01."
          />
          <KpiCard
            label="Ladder — genuine verified redemptions"
            value={fmt(external.ladder)}
            hint="Cumulative, all time, by enrolled merchants. This is the 1 → 5 → 10 ladder. Enrolling a merchant does not move it."
          />
          <KpiCard
            label="Rung reached"
            value={rung.reached === null ? "none" : rung.reached.toLocaleString()}
            hint={rung.next === null ? "The ladder is complete." : `Next rung: ${rung.next}.`}
          />
          <KpiCard
            label="Internal / E2E merchants"
            value={internalMerchantIds().length.toLocaleString()}
            hint="MAANTA testing itself. Technical evidence, never field evidence (D184)."
          />
        </div>
        {/* The ladder itself, as rungs. Ink only — a money-adjacent milestone is never celebrated. */}
        <ol className="mt-3 flex flex-wrap items-center gap-2" aria-label="Ladder rungs">
          {LADDER_RUNGS.map((r) => {
            const reached = external.ladder !== null && external.ladder >= r;
            return (
              <li
                key={r}
                className={
                  reached
                    ? "rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white"
                    : "rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-muted"
                }
              >
                {reached ? "✓ " : "○ "}
                {r}
              </li>
            );
          })}
        </ol>
        {enrolled === 0 ? (
          <p className="mt-3 rounded-card bg-white px-4 py-3 text-sm text-ink shadow-card">
            <strong className="font-semibold">External field validation is 0.</strong> No merchant
            is enrolled and no genuine verified redemption exists. Nothing below tests the pull
            hypothesis yet.
          </p>
        ) : null}
      </Section>

      {/* ---- 2. The clocks ----------------------------------------------- */}
      <Section title="Clocks and tripwires" subtitle="Each computed only when its input exists. Not adjusted during the run." className="mt-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-card bg-white p-4 shadow-card">
            <p className="text-xs text-muted">Kill criterion · {KILL_CRITERION_WEEKS}-week clock</p>
            <p className="tnum mt-1 text-2xl font-bold text-ink">{clock.label}</p>
            <p className="mt-1 text-[11px] leading-snug text-faint">
              Runs from the day Merchant 01 went live. If it, plus two further genuine merchants,
              have run — or {KILL_CRITERION_WEEKS} weeks have passed — with no unprompted repost,
              payment question or claim, the pull hypothesis is unsupported at this density. The
              next decision is density or premise, not another merchant and not more time.
            </p>
          </div>
          <div className="rounded-card bg-white p-4 shadow-card">
            <p className="text-xs text-muted">Claim → walk-in tripwire · external claims only</p>
            <p className="tnum mt-1 text-2xl font-bold text-ink">{tripwire.label}</p>
            <p className="mt-1 text-[11px] leading-snug text-faint">
              {tripwire.state === "not_computable"
                ? `Not computed below ${MIN_CLAIMS_FOR_MERCHANT_RATIO} genuine field claims — a ratio from fewer would describe noise. ${fmt(external.claimsAllTime)} so far.`
                : tripwire.state === "tripped"
                  ? `Under roughly 1 in ${Math.round(1 / TRIPWIRE_FLOOR)}: stop the ladder for a diagnosis before another merchant is added. A tripwire, not a target.`
                  : `At or above roughly 1 in ${Math.round(1 / TRIPWIRE_FLOOR)}. A tripwire, not a target — no pass percentage exists.`}
            </p>
          </div>
        </div>
      </Section>

      {/* ---- 3. The next move -------------------------------------------- */}
      <Section title="Next move" subtitle="From the written Node 0 sequence and the state above. Not a recommendation from a model." className="mt-6">
        <div className="rounded-card border border-ink bg-white p-4 shadow-card">
          <p className="text-sm font-bold text-ink">{nextMove.title}</p>
          <p className="mt-1 text-sm text-secondary">{nextMove.detail}</p>
          {demoMode.ok && demoMode.enabled && nextMove.requiresDemoOff ? (
            <p className="mt-2 text-sm text-ink">
              <strong className="font-semibold">Demo mode is ON.</strong> This step must run with it
              OFF or the evidence is contaminated (D189). Prospect demos and the measured pilot are
              in tension; which wins today is the founder&apos;s call.
            </p>
          ) : null}
        </div>
      </Section>

      {/* ---- 4. Right now ------------------------------------------------- */}
      <Section
        title="Right now"
        subtitle="A snapshot as this page loaded. Current supply and cohort size are shown as a snapshot, not as yesterday's change."
        className="mt-6"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Demo mode"
            value={demoMode.ok ? (demoMode.enabled ? "ON" : "OFF") : "—"}
            hint={
              demoMode.ok
                ? demoMode.enabled
                  ? "Synthetic supply is shopper-visible (ruling 2026-08-26). OFF is required for Merchant 01's onboarding and Shopper 01's claim."
                  : "Only genuine supply reaches shoppers."
                : "Flag unreadable."
            }
          />
          <KpiCard
            label="Merchants live"
            value={fmt(n(merchantsLiveRes))}
            hint="Non-demo merchants a shopper could reach right now: active, visible, not shadow-banned. Not the same as enrolled."
          />
          <KpiCard
            label="Shopper-visible deals"
            value={demoMode.ok ? fmt(n(visibleDealsRes)) : "—"}
            hint={demoMode.ok && demoMode.enabled ? "Includes synthetic deals while demo mode is ON." : undefined}
          />
          <KpiCard label="Awaiting approval" value={fmt(pendingCount)} />
        </div>
        <ul className="mt-3 space-y-2">
          <QueueLine
            count={heldCount}
            noun={(c) => `${c} redemption${c === 1 ? "" : "s"} held by Guardian`}
            href="/admin/redemptions"
            canOpenAdminConsole={canOpenAdminConsole}
          />
          <QueueLine
            count={pendingCount}
            noun={(c) => `${c} merchant${c === 1 ? "" : "s"} awaiting approval`}
            href="/admin/approvals"
            canOpenAdminConsole={canOpenAdminConsole}
          />
          <QueueLine
            count={tasksCount}
            noun={(c) => `${c} open support task${c === 1 ? "" : "s"}`}
            href="/admin/queue"
            canOpenAdminConsole={canOpenAdminConsole}
          />
        </ul>
      </Section>

      {/* ---- 5. Last seven days ------------------------------------------ */}
      <Section title="Last 7 days — external cohort" subtitle="Enrolled pilot merchants only. The numbers the ladder counts." className="mt-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Claims" value={fmt(external.claims7d)} />
          <KpiCard label="Arrivals / check-ins" value={fmt(external.arrivals7d)} />
          <KpiCard label="Verified visits" value={fmt(external.verified7d)} />
          <KpiCard label={FEE_FIGURE_LABELS.net} value={feeFigure(external.fees7d.netKes)} />
          <KpiCard label={FEE_FIGURE_LABELS.gross} value={feeFigure(external.fees7d.grossKes)} />
          <KpiCard label={FEE_FIGURE_LABELS.reversals} value={feeFigure(external.fees7d.reversalsKes)} />
        </div>
        {enrolled === 0 ? (
          <p className="mt-2 text-xs text-muted">
            Nobody is enrolled, so these are zero by construction rather than unread.
          </p>
        ) : null}
      </Section>

      <Section
        title="Last 7 days — all genuine-tagged activity"
        subtitle="Marketplace-wide: external, internal and unclassified together (D188). An operational view, not evidence of pull."
        className="mt-6"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label={claims.label}
            value={fmt(n(allClaims7dRes))}
            hint={claims.hint ?? undefined}
          />
          <KpiCard label="Arrivals / check-ins" value={fmt(n(allArrivals7dRes))} />
          <KpiCard label="Verified visits" value={fmt(n(allVerified7dRes))} />
          <KpiCard label={FEE_FIGURE_LABELS.net} value={feeFigure(allFees7d.netKes)} />
          <KpiCard label={FEE_FIGURE_LABELS.gross} value={feeFigure(allFees7d.grossKes)} />
          <KpiCard label={FEE_FIGURE_LABELS.reversals} value={feeFigure(allFees7d.reversalsKes)} />
        </div>
      </Section>

      {/* Yesterday sits above Operations on purpose: the first question a
          founder opens this page with is "what happened", not "what can I
          click". Unlike the /admin/* cards below it is founder-scoped, so a
          co-founder can open it. */}
      <Section title="Daily brief" className="mt-6">
        <Link
          href="/founder/yesterday"
          className="block rounded-card bg-white px-4 py-3 shadow-card transition hover:bg-stone-soft"
        >
          <span className="text-sm font-semibold text-ink">Yesterday →</span>
          <span className="mt-0.5 block text-xs text-muted">
            What changed yesterday: claims, arrivals, verified visits, success
            fees and unresolved alerts, with the genuine/demo split stated.
            Current supply and cohort size are shown alongside as a snapshot,
            not as yesterday&rsquo;s change.
          </span>
        </Link>
      </Section>

      <Section title="Accounts" subtitle="Registered accounts, all roles. Not a measure of the pilot." className="mt-6">
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Total users" value={fmt(n(totalUsersRes))} />
          <KpiCard label="Shoppers" value={fmt(n(shoppersRes))} />
          <KpiCard label="Merchant accounts" value={fmt(n(merchantAccountsRes))} />
        </div>
      </Section>

      <Section title="Operations" subtitle={`${fmt(tasksCount)} open tasks`} className="mt-6">
        {/* Gated: every card points into /admin/*, which a co-founder cannot open. */}
        <OperationsLinks
          canOpenAdminConsole={canAccessAdminConsole(user.role)}
          pendingMerchants={pendingCount ?? 0}
        />
      </Section>
    </Page>
  );
}

/**
 * One queue line, driven by a NULLABLE count and a gated link.
 *
 * Three states, never two: a genuine zero renders nothing, a positive count
 * renders the line, and an unreadable count renders an explicit unavailable
 * row. A co-founder sees the line without a link into a console that would
 * refuse them; the queue is real and they need to know it exists.
 */
function QueueLine({
  count,
  noun,
  href,
  canOpenAdminConsole,
}: {
  count: number | null;
  noun: (n: number) => string;
  href: string;
  canOpenAdminConsole: boolean;
}) {
  const state = queueAlertState(count);
  if (state === "unavailable" || count === null) {
    return (
      <li role="alert" className="rounded-card bg-white px-4 py-3 text-sm text-ink shadow-card">
        {noun(0).replace(/^\d+\s*/, "")} — unavailable. Unknown, not clear.
      </li>
    );
  }
  if (state === "silent") return null;
  return (
    <li className="rounded-card bg-white px-4 py-3 shadow-card">
      {canOpenAdminConsole ? (
        <Link href={href} className="text-sm font-semibold text-ink underline-offset-2 hover:underline">
          {noun(count)}
        </Link>
      ) : (
        <p className="text-sm font-semibold text-ink">{noun(count)}</p>
      )}
      {canOpenAdminConsole ? null : (
        <p className="mt-0.5 text-xs text-muted">Worked in the admin console, which this role cannot open.</p>
      )}
    </li>
  );
}
