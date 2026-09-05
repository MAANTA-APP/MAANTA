import { requireAdminPage } from "@/lib/admin";
import { AdminReadError } from "@/components/admin/read-error";
import { FACTS } from "@/lib/marketing/facts";
import { parsePopulation } from "@/lib/growth/population";
import { readLeads } from "@/lib/growth/data";
import {
  isOverdue,
  leadAddress,
  leadAgeLabel,
  onboardingStepsLeft,
  pipelineFrom,
  LEAD_REPLY_SLA_BUSINESS_DAYS,
  type MerchantLead,
} from "@/lib/growth/leads";
import {
  PopulationChip,
  PopulationFilter,
} from "@/components/admin/growth/population-controls";
import {
  ExpectedEmpty,
  GrowthBadge,
  GrowthPageHeader,
} from "@/components/admin/growth/growth-ui";
import { LeadStageActions } from "@/components/admin/growth/lead-stage-actions";

export const dynamic = "force-dynamic";

/**
 * G3 — Merchant leads.
 *
 * A lead is a unit on a floor, not a brand: cards lead with `GF · Unit 12`,
 * because that is how an agent covers a mall and because MAANTA holds no trading
 * name for a shop that has not signed anything.
 *
 * Six columns do not work at 390px, so below `lg` the stages become native
 * `<details>` accordions — no JavaScript, and the overdue stage is `open` by
 * default because it is the only one with a deadline attached.
 */
export default async function AdminGrowthLeadsPage({
  searchParams,
}: {
  searchParams: { population?: string };
}) {
  await requireAdminPage();
  const population = parsePopulation(searchParams.population);
  const read = await readLeads(population);

  if (!read.readable) {
    return (
      <main className="max-w-7xl">
        <GrowthPageHeader title="Merchant leads" />
        <div className="mt-5">
          <AdminReadError what="the merchant lead board" />
        </div>
      </main>
    );
  }

  const leads = read.rows;
  const pipeline = pipelineFrom(leads);
  const overdue = leads.filter((l) => isOverdue(l));
  const open = leads.filter((l) => l.stage !== "lost").length;

  return (
    <main className="max-w-7xl">
      <GrowthPageHeader
        title="Merchant leads"
        subtitle={`${FACTS.nodeLabel} · ${FACTS.candidateMall} · ${open} open`}
      >
        <PopulationChip population={population} />
        <PopulationFilter basePath="/admin/growth/leads" population={population} />
      </GrowthPageHeader>

      {overdue.length > 0 ? (
        <p className="mt-4 flex items-center gap-3 rounded-xl border border-flame-tint bg-flame-tint px-4 py-3">
          <span
            aria-hidden
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.8px] border-flame text-xs font-bold text-flame"
          >
            !
          </span>
          <span className="text-sm font-medium leading-snug text-ink">
            {overdue.length} {overdue.length === 1 ? "lead is" : "leads are"} past the{" "}
            {LEAD_REPLY_SLA_BUSINESS_DAYS}-business-day reply published on /merchants.
            They are pinned to the top of New.
          </span>
        </p>
      ) : null}

      {leads.length === 0 ? (
        <div className="mt-5 max-w-md">
          <ExpectedEmpty>
            No merchant leads logged yet. Node 0 acquisition starts with one unit
            on one floor — add the first from the agent day sheet.
          </ExpectedEmpty>
        </div>
      ) : (
        <>
          {/* Desktop: the board. */}
          <div className="mt-5 hidden gap-3 lg:grid lg:grid-cols-6 lg:items-start">
            {pipeline.map((column) => (
              <section
                key={column.stage}
                className="rounded-2xl border border-line bg-stone p-3"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2
                    className={`text-xs font-bold ${
                      column.stage === "lost" ? "text-muted" : "text-ink"
                    }`}
                  >
                    {column.label}
                  </h2>
                  <span
                    className={`font-mono text-xs font-bold [font-variant-numeric:tabular-nums] ${
                      column.stage === "lost" ? "text-muted" : "text-ink"
                    }`}
                  >
                    {column.count}
                  </span>
                </div>
                {column.count === 0 ? (
                  <ExpectedEmpty>
                    {column.stage === "ready_to_publish"
                      ? "Nothing here yet — and that is expected before Node 0 opens."
                      : "Nothing in this stage."}
                  </ExpectedEmpty>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {column.leads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          {/* Phone: stages as accordions. Overdue is open by default. */}
          <div className="mt-5 flex flex-col gap-2 lg:hidden">
            {pipeline.map((column) => {
              const hasOverdue = column.leads.some((l) => isOverdue(l));
              return (
                <details
                  key={column.stage}
                  open={hasOverdue}
                  className="overflow-hidden rounded-2xl border border-line bg-white"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-3 bg-stone px-4 py-3.5">
                    <span
                      className={`text-[15px] font-bold ${
                        column.stage === "lost" ? "text-muted" : "text-ink"
                      }`}
                    >
                      {column.label}
                    </span>
                    <span className="flex items-center gap-2">
                      {hasOverdue ? <GrowthBadge tone="error">Late</GrowthBadge> : null}
                      <span className="font-mono text-sm font-bold text-ink [font-variant-numeric:tabular-nums]">
                        {column.count}
                      </span>
                    </span>
                  </summary>
                  <div className="flex flex-col gap-2.5 p-3">
                    {column.count === 0 ? (
                      <ExpectedEmpty>
                        {column.stage === "ready_to_publish"
                          ? "Nothing here yet — and that is expected before Node 0 opens."
                          : "Nothing in this stage."}
                      </ExpectedEmpty>
                    ) : (
                      column.leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

function LeadCard({ lead }: { lead: MerchantLead }) {
  const late = isOverdue(lead);
  const stepsLeft = lead.stage === "onboarding" ? onboardingStepsLeft(lead) : null;

  return (
    <article
      className={`rounded-xl border bg-white p-3 ${
        late
          ? "border-line border-l-[3px] border-l-flame"
          : // Amber marks the one card a person can finish today: a shop one step
            // from being able to publish. Overdue is flame — urgency and blockage
            // are different colours, and only one of them is anybody's fault.
            stepsLeft === 1
            ? "border-brand"
            : "border-line"
      } ${lead.stage === "lost" ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[13px] font-bold text-ink [font-feature-settings:'zero']">
          {leadAddress(lead)}
        </p>
        <span
          className={`shrink-0 rounded font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${
            late
              ? "border border-flame bg-flame-tint px-1.5 py-1 text-ink"
              : "bg-stone px-1.5 py-1 text-muted"
          }`}
        >
          {leadAgeLabel(lead)}
        </span>
      </div>

      {lead.shopName ? (
        // Their name for the shop, given on the public form — shown under the
        // unit, never instead of it. The unit is still the identity (D265).
        <p className="mt-1 text-[13px] font-semibold leading-snug text-ink">{lead.shopName}</p>
      ) : null}
      <p className="mt-1 text-xs leading-snug text-secondary">
        {lead.category ?? "Category not recorded"}
        {lead.contactName ? ` · ${lead.contactName}` : ""}
        {lead.source === "public_form" ? " · via the form" : ""}
      </p>

      {lead.stage === "visit_booked" && lead.visitAt ? (
        <p className="mt-2 text-[11px] font-medium text-verified">
          Visit {new Date(lead.visitAt).toISOString().slice(0, 16).replace("T", " ")}
        </p>
      ) : null}

      {lead.stage === "onboarding" ? (
        <ul className="mt-2 flex flex-col gap-1">
          {[
            { label: "Account created", done: lead.accountCreated },
            { label: "Staff added", done: lead.staffAdded },
            { label: "Wallet topped up", done: lead.walletToppedUp },
          ].map((step) => (
            <li
              key={step.label}
              className={`text-[11px] font-medium ${step.done ? "text-verified" : "text-rust"}`}
            >
              {step.done ? "✓" : "·"} {step.label}
            </li>
          ))}
        </ul>
      ) : null}

      {stepsLeft === 1 ? (
        <p className="mt-2">
          <GrowthBadge tone="caution">1 step left</GrowthBadge>
        </p>
      ) : null}

      {lead.stage === "lost" && lead.lostReason ? (
        <p className="mt-2 text-[11px] text-muted">
          {lead.lostReason.replace(/_/g, " ")}
        </p>
      ) : null}

      <LeadStageActions leadId={lead.id} stage={lead.stage} />
    </article>
  );
}
