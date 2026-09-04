import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logAdminOp } from "@/lib/admin-audit";
import { exportFilename, parsePopulation } from "@/lib/growth/population";
import { isWaitlistSegment } from "@/lib/waitlist";
import {
  filterEntries,
  loadWaitlistDirectory,
  toCsv,
} from "@/lib/growth/waitlist-directory";

export const dynamic = "force-dynamic";

/**
 * Waitlist CSV — and the point of it is that **the export inherits the filter**.
 *
 * A CSV taken with the population on Real contains no test rows, and the
 * filename records which population produced it. An export that quietly carries
 * test data is how an internal smoke-test number ends up in a real campaign
 * send; the filename is what stops the file being misread a week later when
 * nobody remembers which toolbar state it came from.
 *
 * A partial read refuses rather than exporting silently truncated data: a CSV
 * has no room for a "this is a lower bound" banner, and a spreadsheet is exactly
 * where a lower bound gets quoted as a total.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const population = parsePopulation(url.searchParams.get("population"));
  const rawSegment = url.searchParams.get("segment");
  const segment = isWaitlistSegment(rawSegment) ? rawSegment : "all";
  const source = url.searchParams.get("source") ?? "all";
  const q = url.searchParams.get("q") ?? undefined;

  const directory = await loadWaitlistDirectory();
  if (!directory.readable) {
    return NextResponse.json({ error: "Could not read the waitlist." }, { status: 502 });
  }
  if (!directory.complete) {
    return NextResponse.json(
      {
        error:
          `The mirror is not fully synced (${directory.unsynced} unconfirmed rows), so this export would be silently incomplete. Run a sync first.`,
      },
      { status: 409 }
    );
  }

  const rows = filterEntries(directory.entries, { population, segment, source, q });
  const filename = exportFilename("waitlist", population);

  const service = createServiceClient();
  await logAdminOp(service, {
    adminUserId: auth.user.id,
    action: "growth.waitlist.export",
    targetType: "waitlist_contact",
    // The export is not about one contact, so the admin's own id stands as the
    // target: `target_id` is NOT NULL and a synthetic all-zero UUID would read
    // like a real row nobody can find.
    targetId: auth.user.id,
    details: { population, segment, source, rows: rows.length, filename },
  });

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Personal data: never cached by a proxy, never stored by the browser.
      "Cache-Control": "no-store, private",
    },
  });
}
