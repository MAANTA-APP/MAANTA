import { requireAdminPage } from "@/lib/admin";
import { AdminReadError } from "@/components/admin/read-error";
import { publicOrigin } from "@/lib/app-url";
import { formatKes } from "@/lib/ui";
import { parsePopulation } from "@/lib/growth/population";
import { readCampaigns } from "@/lib/growth/data";
import {
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_DESTINATIONS,
  withSignupCounts,
} from "@/lib/growth/campaigns";
import { filterEntries, loadWaitlistDirectory } from "@/lib/growth/waitlist-directory";
import {
  PopulationChip,
  PopulationFilter,
} from "@/components/admin/growth/population-controls";
import {
  CardHeading,
  ExpectedEmpty,
  GrowthBadge,
  GrowthCard,
  GrowthPageHeader,
} from "@/components/admin/growth/growth-ui";
import { UtmBuilder } from "@/components/admin/growth/utm-builder";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  running: "good",
  draft: "neutral",
  paused: "caution",
  ended: "neutral",
} as const;

/**
 * G4 — Campaigns.
 *
 * Signups are joined to campaigns by `utm_campaign`, read off the waitlist
 * contact. That is the only join, which is why the builder beside the table is
 * not a convenience: a campaign whose link was typed by hand has a slug nothing
 * matches, and it shows up here as a permanent zero that looks like a failed
 * campaign rather than a broken link.
 *
 * **Spend never leaves this screen.** Cost per signup is an internal operating
 * figure; it does not belong on a public page, in a deck, or beside anything
 * that reads as traction.
 */
export default async function AdminGrowthCampaignsPage({
  searchParams,
}: {
  searchParams: { population?: string };
}) {
  await requireAdminPage();
  const population = parsePopulation(searchParams.population);

  const [read, directory] = await Promise.all([
    readCampaigns(population),
    loadWaitlistDirectory(),
  ]);

  if (!read.readable) {
    return (
      <main className="max-w-6xl">
        <GrowthPageHeader title="Campaigns" />
        <div className="mt-5">
          <AdminReadError what="the campaign list" />
        </div>
      </main>
    );
  }

  // Attribution counts come from the same population the table is showing, so a
  // Real-only view cannot be inflated by a test signup against a real campaign.
  const attributed = filterEntries(directory.entries, { population });
  const signupsBySlug = new Map<string, number>();
  for (const entry of attributed) {
    if (entry.campaign) {
      signupsBySlug.set(entry.campaign, (signupsBySlug.get(entry.campaign) ?? 0) + 1);
    }
  }

  const campaigns = withSignupCounts(read.rows, signupsBySlug);

  return (
    <main className="max-w-6xl">
      <GrowthPageHeader
        title="Campaigns"
        subtitle={`${campaigns.length} ${campaigns.length === 1 ? "campaign" : "campaigns"} · attribution from the UTM on the entry`}
      >
        <PopulationChip population={population} />
        <PopulationFilter basePath="/admin/growth/campaigns" population={population} />
      </GrowthPageHeader>

      {!directory.readable ? (
        <p className="mt-4 rounded-xl border border-rust bg-white px-4 py-3 text-[13px] leading-relaxed text-rust">
          The waitlist audience could not be read, so every signup count below is
          unavailable rather than zero.
        </p>
      ) : !directory.complete ? (
        <p className="mt-4 rounded-xl border border-rust bg-white px-4 py-3 text-[13px] leading-relaxed text-rust">
          <strong className="font-bold">Partial read.</strong> Signup counts are
          lower bounds, so cost per signup is an upper bound. Do not quote either.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3.5 lg:grid-cols-[1fr_300px] lg:items-start">
        <div className="overflow-x-auto rounded-card bg-white shadow-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-paper">
                {["Campaign", "Channel", "Spend", "Signups", "Per signup", "Status"].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted ${
                      i >= 2 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                    No campaigns yet. Build a tracked link first — a campaign
                    without one cannot be measured.
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-semibold text-ink">{c.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-faint">
                        utm_campaign={c.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-secondary">
                      {CAMPAIGN_CHANNEL_LABELS[c.channel]}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-[13px] text-ink [font-variant-numeric:tabular-nums]">
                      {c.spendKes === null ? <span className="text-faint">—</span> : formatKes(c.spendKes)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-sm font-bold text-ink [font-variant-numeric:tabular-nums]">
                      {directory.readable ? c.signups : <span className="text-rust">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-[13px] text-ink [font-variant-numeric:tabular-nums]">
                      {c.costPerSignup === null ? (
                        <span className="text-faint">—</span>
                      ) : (
                        formatKes(c.costPerSignup)
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <GrowthBadge tone={STATUS_TONE[c.status]}>{c.status}</GrowthBadge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3.5">
          <GrowthCard>
            <CardHeading>Build a tracked link</CardHeading>
            <p className="mb-4 mt-1 text-xs leading-relaxed text-muted">
              Never type a UTM by hand. This is the only way a campaign gets a link.
            </p>
            <UtmBuilder destinations={CAMPAIGN_DESTINATIONS} origin={publicOrigin()} />
          </GrowthCard>

          <GrowthCard tone="caution">
            <div className="flex items-center gap-2">
              <span aria-hidden className="block h-1.5 w-1.5 rounded-[2px] bg-rust" />
              <CardHeading>Spend is not a claim</CardHeading>
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-secondary">
              Cost per signup is an internal figure only. It never appears on a
              public page, in a deck, or beside anything that implies traction —
              a cost per signup with a signup count next to it is a traction claim
              whatever the label says.
            </p>
          </GrowthCard>

          {campaigns.length === 0 ? (
            <ExpectedEmpty>
              Campaigns are added directly in the database while Node 0 is a single
              mall — there is no create form here yet.
            </ExpectedEmpty>
          ) : null}
        </div>
      </div>
    </main>
  );
}
