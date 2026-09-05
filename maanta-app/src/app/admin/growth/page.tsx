import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { AdminReadError } from "@/components/admin/read-error";
import { FACTS } from "@/lib/marketing/facts";
import { COLLECTION_OPEN } from "@/lib/marketing/collection-gate";
import { parsePopulation } from "@/lib/growth/population";
import {
  attributionRollup,
  filterEntries,
  loadWaitlistDirectory,
  segmentCounts,
  signupsByDay,
} from "@/lib/growth/waitlist-directory";
import { readLeads } from "@/lib/growth/data";
import {
  coverageByFloor,
  isOverdue,
  LEAD_FLOOR_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
  LEAD_REPLY_SLA_BUSINESS_DAYS,
} from "@/lib/growth/leads";
import { contentHealthSummary } from "@/lib/growth/content-health";
import {
  PopulationChip,
  PopulationFilter,
} from "@/components/admin/growth/population-controls";
import {
  CardHeading,
  CardLabel,
  ExpectedEmpty,
  Figure,
  GrowthCard,
  GrowthPageHeader,
  StatRow,
  GrowthBadge,
} from "@/components/admin/growth/growth-ui";
import { SignupsChart } from "@/components/admin/growth/signups-chart";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 14;

/**
 * G1 — Growth overview.
 *
 * Eight questions answered above the fold: how many are waiting and as what,
 * how many merchant leads are open and how many are late, whether anyone has
 * converted, how much of Node 0 is covered, where signups came from, what the
 * pipeline looks like, whether the public site is healthy, and how much of all
 * of that is untrustworthy data.
 *
 * The last one is not decoration. Every figure here is a count over a chosen
 * population, and the ninth card exists so the operator can see how much was
 * excluded to produce the other eight.
 */
export default async function AdminGrowthPage({
  searchParams,
}: {
  searchParams: { population?: string };
}) {
  await requireAdminPage();
  const population = parsePopulation(searchParams.population);

  const [directory, leadRead] = await Promise.all([
    loadWaitlistDirectory(),
    readLeads(population),
  ]);

  const waitlist = filterEntries(directory.entries, { population });
  const roles = segmentCounts(waitlist);
  const attribution = attributionRollup(waitlist);
  const signups = signupsByDay(waitlist, WINDOW_DAYS);
  const content = contentHealthSummary();

  const leads = leadRead.rows;
  const openLeads = leads.filter((l) => l.stage !== "lost" && l.stage !== "ready_to_publish");
  const overdue = leads.filter((l) => isOverdue(l));
  const needsFirstContact = leads.filter((l) => l.stage === "new");
  const coverage = coverageByFloor(leads);
  const coverageTotal = coverage.GF + coverage["1F"] + coverage["2F"];

  // Data quality — the rows deliberately kept out of every figure above.
  const testHeldBack = directory.entries.filter((e) => e.isTest).length;
  const duplicates = directory.entries.filter((e) => e.flags.includes("duplicate")).length;
  const noConsent = directory.entries.filter((e) => e.flags.includes("no_consent")).length;
  const unreadable = directory.entries.filter((e) => e.propertiesUnreadable).length;
  const unsubscribed = directory.entries.filter((e) => e.unsubscribed).length;

  const waitlistTotal = waitlist.length;
  const partial = !directory.complete;

  return (
    <main className="max-w-6xl">
      <GrowthPageHeader
        title="Growth"
        subtitle={`Pre-launch. ${FACTS.nodeLabel} · ${FACTS.candidateMall}. Collection ${
          COLLECTION_OPEN ? "open" : "closed — test entries only"
        }.`}
      >
        <GrowthBadge tone={COLLECTION_OPEN ? "good" : "neutral"}>
          {COLLECTION_OPEN ? "Collection open" : "Collection closed"}
        </GrowthBadge>
        <PopulationChip population={population} />
        <PopulationFilter basePath="/admin/growth" population={population} />
      </GrowthPageHeader>

      {partial && directory.readable ? (
        <p className="mt-4 rounded-xl border border-rust bg-white px-4 py-3 text-[13px] leading-relaxed text-ink">
          <strong className="font-bold text-rust">Not fully synced.</strong>{" "}
          {directory.lastSyncAt === null
            ? "No sync has ever run, so nothing here has been compared against the sending platform and anyone who signed up before the mirror existed is missing entirely."
            : `${directory.unsynced} ${directory.unsynced === 1 ? "row has" : "rows have"} never been confirmed against the sending platform.`}{" "} Every waitlist figure below is a lower bound,
          not a total — do not quote one until a sync has run.
        </p>
      ) : null}

      {!directory.readable ? (
        <div className="mt-5">
          <AdminReadError what="the waitlist audience" />
        </div>
      ) : null}
      {!leadRead.readable ? (
        <div className="mt-3">
          <AdminReadError what="the merchant lead board" />
        </div>
      ) : null}

      <div className="mt-5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <GrowthCard>
          <CardLabel>Waitlist total</CardLabel>
          <Figure className="mt-3" value={directory.readable ? `${waitlistTotal}${partial ? "+" : ""}` : "—"} />
          {waitlistTotal > 0 ? (
            <div className="mt-3 flex gap-0.5" aria-hidden>
              <span
                className="h-1.5 rounded-l-full bg-ink"
                style={{ width: `${(roles.shopper / waitlistTotal) * 100}%` }}
              />
              <span
                className="h-1.5 bg-brand"
                style={{ width: `${(roles.merchant / waitlistTotal) * 100}%` }}
              />
              <span
                className="h-1.5 rounded-r-full bg-line"
                style={{ width: `${(roles.mall_operator / waitlistTotal) * 100}%` }}
              />
            </div>
          ) : null}
          <div className="mt-3 flex flex-col gap-1.5">
            <StatRow label="Shoppers" value={roles.shopper} />
            <StatRow label="Merchants" value={roles.merchant} />
            <StatRow label="Mall operators" value={roles.mall_operator} />
            {roles.unknown > 0 ? (
              <StatRow label="Role unreadable" value={roles.unknown} tone="caution" />
            ) : null}
          </div>
        </GrowthCard>

        <GrowthCard>
          <CardLabel>Merchant leads open</CardLabel>
          <Figure className="mt-3" value={leadRead.readable ? openLeads.length : "—"} />
          <div className="mt-3 flex flex-col gap-1.5">
            <StatRow
              label="Needs first contact"
              value={needsFirstContact.length}
              tone={needsFirstContact.length > 0 ? "caution" : "default"}
            />
            <StatRow
              label="Visit booked"
              value={leads.filter((l) => l.stage === "visit_booked").length}
            />
            <StatRow
              label={`Overdue > ${LEAD_REPLY_SLA_BUSINESS_DAYS} business day`}
              value={overdue.length}
              tone={overdue.length > 0 ? "error" : "default"}
            />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            Measured against the reply time published on /merchants, not an
            internal target.
          </p>
        </GrowthCard>

        <GrowthCard>
          <CardLabel>Waitlist → activation</CardLabel>
          <Figure className="mt-3" value={0} suffix="%" />
          <div className="mt-3 rounded-xl bg-stone px-3 py-2.5">
            <p className="text-xs leading-relaxed text-secondary">
              Nothing to convert yet — the product has not opened. This starts
              counting on the first verified redemption by a genuine merchant.
            </p>
          </div>
        </GrowthCard>

        <GrowthCard>
          <CardLabel>Node 0 merchant coverage</CardLabel>
          <Figure
            className="mt-3"
            value={leadRead.readable ? coverageTotal : "—"}
            suffix="units with interest"
          />
          <div className="mt-3 flex flex-col gap-1.5">
            {(["GF", "1F", "2F"] as const).map((floor) => (
              <StatRow key={floor} label={LEAD_FLOOR_LABELS[floor]} value={coverage[floor]} />
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            Interest registered — not shops signed, and not shops trading.
          </p>
        </GrowthCard>
      </div>

      <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <GrowthCard>
          <SignupsChart
            days={signups.buckets}
            unknownJoinDate={signups.unknownJoinDate}
            label={`Daily, last ${WINDOW_DAYS} days`}
          />
        </GrowthCard>

        <GrowthCard>
          <CardHeading>Where they came from</CardHeading>
          <p className="mt-1 text-[13px] text-muted">Source · medium · campaign</p>
          {attribution.rows.length === 0 && attribution.unattributed === 0 ? (
            <div className="mt-4">
              <ExpectedEmpty>
                No attributed signups yet. Campaign links carry the UTM that fills
                this in.
              </ExpectedEmpty>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col">
              {attribution.rows.slice(0, 5).map((row) => (
                <li
                  key={`${row.source}-${row.medium}-${row.campaign}`}
                  className="flex items-center justify-between gap-3 border-b border-line py-2.5 first:pt-0 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {row.source} · {row.medium ?? "none"}
                    </p>
                    <p className="truncate font-mono text-[11px] text-faint">
                      {row.campaign ?? "—"}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[15px] font-bold text-ink [font-variant-numeric:tabular-nums]">
                    {row.count}
                  </span>
                </li>
              ))}
              {attribution.unattributed > 0 ? (
                <li className="mt-2.5 flex items-center justify-between gap-3 border-l-2 border-flame pl-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink">unattributed</p>
                    <p className="font-mono text-[11px] text-faint">no utm on entry</p>
                  </div>
                  <span className="shrink-0 font-mono text-[15px] font-bold text-ink [font-variant-numeric:tabular-nums]">
                    {attribution.unattributed}
                  </span>
                </li>
              ) : null}
            </ul>
          )}
        </GrowthCard>
      </div>

      <div className="mt-3.5 grid gap-3.5 lg:grid-cols-3">
        <GrowthCard>
          <CardHeading>Merchant lead pipeline</CardHeading>
          <div className="mt-4 flex flex-col gap-2.5">
            {LEAD_STAGES.filter((s) => s !== "lost").map((stage) => {
              const count = leads.filter((l) => l.stage === stage).length;
              const widest = Math.max(
                1,
                ...LEAD_STAGES.filter((s) => s !== "lost").map(
                  (s) => leads.filter((l) => l.stage === s).length
                )
              );
              return (
                <div key={stage}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span
                      className={`text-[13px] font-medium ${count === 0 ? "text-muted" : "text-ink"}`}
                    >
                      {LEAD_STAGE_LABELS[stage]}
                    </span>
                    <span
                      className={`font-mono text-[13px] font-semibold [font-variant-numeric:tabular-nums] ${count === 0 ? "text-muted" : "text-ink"}`}
                    >
                      {count}
                    </span>
                  </div>
                  <span
                    className={`block h-2 rounded-full ${
                      // Amber marks the stage that needs a hand: a shop mid-onboarding
                      // is one the team can finish today. Everything else is ink.
                      stage === "onboarding" && count > 0 ? "bg-brand" : count === 0 ? "bg-stone-soft" : "bg-ink"
                    }`}
                    style={{ width: count === 0 ? "100%" : `${Math.max(8, (count / widest) * 100)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <Link
            href={`/admin/growth/leads?population=${population}`}
            className="mt-4 flex h-9 items-center justify-center rounded-pill border border-ink bg-white text-[13px] font-semibold text-ink hover:bg-stone"
          >
            Open the board
          </Link>
        </GrowthCard>

        <GrowthCard>
          <CardHeading>Content &amp; SEO health</CardHeading>
          <div className="mt-4 flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
              <span className="text-[13px] text-secondary">Indexable routes</span>
              <span className="font-mono text-[13px] font-semibold text-ink [font-variant-numeric:tabular-nums]">
                {content.indexableRoutes}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <span className="text-[13px] text-secondary">Pages with OG card</span>
              <span
                className={`font-mono text-[13px] font-semibold [font-variant-numeric:tabular-nums] ${
                  content.missingOg.length > 0 ? "text-rust" : "text-verified"
                }`}
              >
                {content.ogCovered} / {content.ogExpected}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <span className="text-[13px] text-secondary">Legal drafts noindex</span>
              <span className="font-mono text-[13px] font-semibold text-verified [font-variant-numeric:tabular-nums]">
                {content.legalDraftsNoindex} / {content.legalDraftsNoindex}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2.5">
              <span className="text-[13px] text-secondary">Disallowed prefixes</span>
              <span className="font-mono text-[13px] font-semibold text-ink [font-variant-numeric:tabular-nums]">
                {content.disallowedPrefixes}
              </span>
            </div>
          </div>
          <Link
            href="/admin/growth/content"
            className="mt-4 flex h-9 items-center justify-center rounded-pill border border-ink bg-white text-[13px] font-semibold text-ink hover:bg-stone"
          >
            Open Content &amp; SEO
          </Link>
        </GrowthCard>

        <GrowthCard tone="caution">
          <div className="flex items-center gap-2">
            <span aria-hidden className="block h-1.5 w-1.5 rounded-[2px] bg-rust" />
            <CardHeading>Data quality</CardHeading>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <StatRow label="TEST rows held back" value={testHeldBack} tone="caution" />
            <StatRow label="Duplicate numbers" value={duplicates} tone={duplicates ? "caution" : "default"} />
            <StatRow label="Consent not recorded" value={noConsent} tone={noConsent ? "error" : "default"} />
            <StatRow label="Unattributed entries" value={attribution.unattributed} tone="caution" />
            <StatRow
              label="Metadata unreadable"
              value={unreadable}
              tone={unreadable ? "error" : "default"}
            />
            <StatRow
              label="Unsubscribed (kept out of export)"
              value={unsubscribed}
              tone={unsubscribed ? "caution" : "default"}
            />
          </div>
          <p className="mt-3.5 text-[11px] leading-relaxed text-faint">
            {population === "real"
              ? "TEST rows are excluded from every figure above."
              : "The population filter is not set to Real — figures above include test rows."}
          </p>
        </GrowthCard>
      </div>
    </main>
  );
}
