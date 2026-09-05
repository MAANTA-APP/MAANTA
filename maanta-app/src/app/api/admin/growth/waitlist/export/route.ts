import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
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
 *
 * **People who have unsubscribed are not in the file unless asked for by
 * name** (`?unsubscribed=include`), and the filename says so when they are.
 * They are still signups and the console still shows them, but a CSV is a send
 * list the moment it leaves this screen, and mailing someone who opted out is
 * the one thing this export must never make easy (D267).
 *
 * The audit write happens BEFORE the file is returned and is not best-effort,
 * the same rule as revealing a phone number: this is the bulk version of that
 * act — every name, address and number in the population, in one download that
 * leaves the system. If the trail cannot record it, the file is withheld.
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
  const includeUnsubscribed = url.searchParams.get("unsubscribed") === "include";

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

  const rows = filterEntries(directory.entries, {
    population,
    segment,
    source,
    q,
    unsubscribed: includeUnsubscribed ? "include" : "exclude",
  });
  // The filename carries the choice, the same way it carries the population: a
  // week later nobody remembers which link produced the file.
  const filename = exportFilename(
    includeUnsubscribed ? "waitlist-incl-unsubscribed" : "waitlist",
    population
  );

  const service = createServiceClient();
  const { error: auditError } = await service.from("admin_ops_log").insert({
    admin_user_id: auth.user.id,
    action: "growth.waitlist.export",
    target_type: "waitlist_contact",
    // The export is not about one contact, so the admin's own id stands as the
    // target: `target_id` is NOT NULL and a synthetic all-zero UUID would read
    // like a real row nobody can find.
    target_id: auth.user.id,
    // `q` is deliberately not recorded: a search term is often a name or an
    // address fragment, and the audit trail must not accumulate what it guards.
    details: { population, segment, source, includeUnsubscribed, rows: rows.length, filename },
  });
  if (auditError) {
    console.error("growth: export audit write failed", { code: auditError.code });
    return NextResponse.json(
      { error: "Could not record the export, so the file is withheld." },
      { status: 503 }
    );
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Personal data: never cached by a proxy, never stored by the browser.
      "Cache-Control": "no-store, private",
    },
  });
}
