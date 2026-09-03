import { requireFounderPage } from "@/lib/founder";
import { PlatformReport, resolveReportRange } from "@/components/admin/platform-report";

export const dynamic = "force-dynamic";

/**
 * Founder-scoped platform reporting — the same report as `/admin/reports`,
 * behind the founder guard.
 *
 * This route used to `redirect("/admin/reports")` on the assumption that
 * `requireFounderPage` ≡ admin. That stopped being true when `cofounder`
 * became a role (migration 20260804010000): a co-founder reaching this URL
 * was redirected into the admin console and bounced to `/`. The report is
 * read-only aggregated metrics — exactly what the founder dashboard exists to
 * show — so it renders here under the founder guard, from the one shared
 * component, and the range pills stay inside this shell.
 */
export default async function FounderReportsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  await requireFounderPage();
  return <PlatformReport range={resolveReportRange(searchParams.range)} basePath="/founder/reports" />;
}
