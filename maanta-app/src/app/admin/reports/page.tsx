import { requireAdminPage } from "@/lib/admin";
import { PlatformReport, resolveReportRange } from "@/components/admin/platform-report";

export const dynamic = "force-dynamic";

/**
 * Platform reporting for the admin shell. The report itself — reads, the
 * D164 read-failure guard, the chart — lives in
 * `components/admin/platform-report.tsx` and is shared with `/founder/reports`,
 * so the two shells cannot report the same money differently.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  await requireAdminPage();
  return <PlatformReport range={resolveReportRange(searchParams.range)} basePath="/admin/reports" />;
}
