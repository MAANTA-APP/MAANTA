import { requireAdminPage } from "@/lib/admin";
import {
  CLAIMS_GUARDS,
  contentHealthSummary,
  routeHealth,
  type IndexPolicy,
} from "@/lib/growth/content-health";
import { NON_INDEXABLE_PREFIXES } from "@/lib/marketing/nav";
import {
  CardHeading,
  GrowthBadge,
  GrowthCard,
  GrowthPageHeader,
} from "@/components/admin/growth/growth-ui";

export const dynamic = "force-dynamic";

const POLICY_TONE: Record<IndexPolicy, "good" | "caution" | "error"> = {
  index: "good",
  noindex: "caution",
  disallowed: "error",
};

const POLICY_LABEL: Record<IndexPolicy, string> = {
  index: "Index",
  noindex: "Noindex",
  disallowed: "Disallowed",
};

/**
 * G5 — Content & SEO.
 *
 * This screen surfaces the crawl policy that already exists in code; it does not
 * hold a second opinion about it. `lib/marketing/nav.ts` owns both halves —
 * `SITEMAP_ROUTES` and `NON_INDEXABLE_PREFIXES` — and re-deriving either here is
 * how `/feed` once ended up excluded from discovery and open to crawling at the
 * same time. So the table is read-only and says where the list lives.
 *
 * The claims guard panel is an **inventory, not a live scan**. Those guards read
 * `.tsx` source, and source is not on disk in a deployed build — a request-time
 * scan would find nothing to scan and report a perfect score for that reason
 * alone. A green light meaning "I could not look" is the exact failure that made
 * `check-server-forms.mjs` necessary (D41), so this panel names each guard and
 * where it runs instead of inventing a zero.
 */
export default async function AdminGrowthContentPage() {
  await requireAdminPage();

  const summary = contentHealthSummary();
  const routes = routeHealth();
  const indexable = routes.filter((r) => r.policy === "index");
  const legal = routes.filter((r) => r.policy === "noindex");

  return (
    <main className="max-w-6xl">
      <GrowthPageHeader
        title="Content & SEO"
        subtitle={`${summary.indexableRoutes} indexable routes · ${summary.legalDraftsNoindex} legal drafts held back · ${summary.disallowedPrefixes} disallowed prefixes`}
      />

      <div className="mt-5 grid gap-3.5 lg:grid-cols-[1fr_310px] lg:items-start">
        <div className="overflow-x-auto rounded-card bg-white shadow-card">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-paper">
                {["Route", "Priority", "OG card", "Policy"].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted ${
                      i === 3 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...indexable, ...legal].map((route) => (
                <tr key={route.path} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-mono text-[13px] font-medium text-ink">
                    {route.path}
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] text-ink [font-variant-numeric:tabular-nums]">
                    {route.priority ?? <span className="text-faint">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold">
                    {route.hasOgImage === null ? (
                      <span className="text-faint">n/a</span>
                    ) : route.hasOgImage ? (
                      <span className="text-verified">Yes</span>
                    ) : (
                      <span className="text-rust">Missing</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <GrowthBadge tone={POLICY_TONE[route.policy]}>
                      {POLICY_LABEL[route.policy]}
                    </GrowthBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-faint">
            Read-only. The list lives in{" "}
            <code className="font-mono">lib/marketing/nav.ts</code>, and{" "}
            <code className="font-mono">marketing-crawl-policy.test.ts</code> fails
            if any route is covered by neither half of it.
          </p>
        </div>

        <div className="flex flex-col gap-3.5">
          <GrowthCard>
            <CardHeading>Claims guard</CardHeading>
            <p className="mb-3.5 mt-1 text-xs leading-relaxed text-muted">
              Every trading claim resolves through one module. These are the checks
              that hold it — they run in CI and block the merge. This panel is the
              index of them, not a re-scan: source is not on disk in a deployed
              build, so a live green here would only mean “I could not look”.
            </p>
            <ul className="flex flex-col">
              {CLAIMS_GUARDS.map((guard) => (
                <li
                  key={guard.guard}
                  className="border-b border-line py-2.5 first:pt-0 last:border-0 last:pb-0"
                >
                  <p className="text-xs leading-snug text-secondary">{guard.forbids}</p>
                  <p className="mt-1 flex items-center gap-1.5">
                    <code className="font-mono text-[11px] text-ink">{guard.guard}</code>
                    <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-faint">
                      {guard.runsIn === "build" ? "post-build" : "vitest"}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </GrowthCard>

          <section className="rounded-card bg-ink p-5">
            <h2 className="text-base font-bold tracking-tight text-white">Crawl policy</h2>
            <p className="mb-3.5 mt-1 text-xs leading-relaxed text-white/60">
              Two files, one policy: <code className="font-mono">robots.ts</code> and{" "}
              <code className="font-mono">sitemap.ts</code> both read the same list.
              Read-only here.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {NON_INDEXABLE_PREFIXES.slice(0, 8).map((prefix) => (
                <li
                  key={prefix}
                  className="rounded-md bg-white/10 px-1.5 py-1 font-mono text-[11px] font-medium text-white/90"
                >
                  {prefix}
                </li>
              ))}
              {NON_INDEXABLE_PREFIXES.length > 8 ? (
                <li className="rounded-md bg-white/10 px-1.5 py-1 font-mono text-[11px] font-medium text-white/90">
                  +{NON_INDEXABLE_PREFIXES.length - 8} more
                </li>
              ) : null}
            </ul>
            <p className="mt-3.5 border-t border-white/15 pt-3 text-xs leading-relaxed text-white/70">
              The four legal routes are deliberately <em>not</em> disallowed
              (founder ruling 2026-08-01): a disallow stops the crawl that would
              read the <code className="font-mono">noindex</code>, so the two work
              against each other.
            </p>
          </section>

          <GrowthCard>
            <CardHeading>To fix</CardHeading>
            <div className="mt-3 flex flex-col gap-2.5">
              {summary.missingOg.length > 0 ? (
                <div className="rounded-lg border border-brand-light bg-brand-tint px-3 py-2.5">
                  <p className="text-xs leading-relaxed text-ink">
                    <span className="font-mono font-bold text-rust">
                      {summary.missingOg.length}
                    </span>{" "}
                    indexable {summary.missingOg.length === 1 ? "route" : "routes"} with
                    no OG card:{" "}
                    {summary.missingOg.map((p) => (
                      <code key={p} className="font-mono text-[11px]">
                        {p}{" "}
                      </code>
                    ))}
                    — these render bare in a WhatsApp forward.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-verified-tint bg-verified-tint px-3 py-2.5">
                  <p className="text-xs leading-relaxed text-ink">
                    Every indexable route ships its own OG card. Nothing to do.
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-line bg-stone px-3 py-2.5">
                <p className="text-xs leading-relaxed text-ink">
                  Legal drafts stay <code className="font-mono">noindex</code> until
                  reviewed. Nothing to do — this is the policy working.
                </p>
              </div>
            </div>
          </GrowthCard>
        </div>
      </div>
    </main>
  );
}
