import { requireAdminPage } from "@/lib/admin";
import { AdminReadError } from "@/components/admin/read-error";
import { SearchField } from "@/components/ui/inputs";
import { maskPhone } from "@/lib/ui";
import { isWaitlistSegment, WAITLIST_SEGMENT_OPTIONS, type WaitlistSegment } from "@/lib/waitlist";
import {
  parsePopulation,
  POPULATION_FOOTNOTE,
} from "@/lib/growth/population";
import {
  filterEntries,
  loadWaitlistDirectory,
  sourcesIn,
  type WaitlistEntry,
} from "@/lib/growth/waitlist-directory";
import {
  PopulationChip,
  PopulationFilter,
} from "@/components/admin/growth/population-controls";
import { GrowthBadge, GrowthPageHeader } from "@/components/admin/growth/growth-ui";
import { RevealNumber } from "@/components/admin/growth/reveal-number";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const SEGMENT_LABEL: Record<WaitlistSegment, string> = {
  shopper: "Shopper",
  merchant: "Merchant",
  mall_operator: "Mall operator",
};

/**
 * G2 — Waitlist.
 *
 * The store is the Resend audience, not Supabase (founder decision 2026-07-10),
 * so this screen reads back out of Resend rather than growing a second copy of
 * the same people. Two consequences the operator can see: the console assembles
 * at most `MAX_DIRECTORY_CONTACTS` in one request, and it says so rather than
 * quietly truncating.
 *
 * TEST rows carry **three** signals — a rust left bar, a filled TEST badge and
 * the test label — because one of them has to survive a greyscale screenshot,
 * and because a test row that is only distinguishable by colour will eventually
 * be read as a real signup by someone looking at a printout.
 */
export default async function AdminGrowthWaitlistPage({
  searchParams,
}: {
  searchParams: { population?: string; segment?: string; source?: string; q?: string; page?: string };
}) {
  await requireAdminPage();

  const population = parsePopulation(searchParams.population);
  const segment = isWaitlistSegment(searchParams.segment) ? searchParams.segment : "all";
  const source = searchParams.source?.trim() || "all";
  const q = searchParams.q?.trim() || "";
  const page = Math.max(1, Number(searchParams.page) || 1);

  const directory = await loadWaitlistDirectory();

  if (!directory.readable) {
    return (
      <main className="max-w-6xl">
        <GrowthPageHeader title="Waitlist" />
        <div className="mt-5">
          <AdminReadError what="the waitlist audience" />
        </div>
      </main>
    );
  }

  const filtered = filterEntries(directory.entries, { population, segment, source, q });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const realCount = directory.entries.filter((e) => !e.isTest).length;
  const testCount = directory.entries.filter((e) => e.isTest).length;
  const sources = sourcesIn(directory.entries);

  const carry = { segment, source, q };
  const linkTo = (over: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = { population, ...carry, ...over };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== "" && value !== "all") search.set(key, String(value));
    }
    return `/admin/growth/waitlist?${search.toString()}`;
  };

  const exportHref = (() => {
    const search = new URLSearchParams({ population });
    if (segment !== "all") search.set("segment", segment);
    if (source !== "all") search.set("source", source);
    if (q) search.set("q", q);
    return `/api/admin/growth/waitlist/export?${search.toString()}`;
  })();

  return (
    <main className="max-w-6xl">
      <GrowthPageHeader
        title="Waitlist"
        subtitle={`${realCount}${directory.complete ? "" : "+"} real entries · ${testCount} test ${
          testCount === 1 ? "entry" : "entries"
        } held separately`}
      >
        <PopulationChip population={population} />
        {directory.complete ? (
          <a
            href={exportHref}
            className="inline-flex h-9 items-center justify-center rounded-pill bg-ink px-4 text-[13px] font-semibold text-white hover:bg-ink-900"
          >
            Export CSV
          </a>
        ) : (
          <span className="inline-flex h-9 items-center justify-center rounded-pill bg-cream-dark px-4 text-[13px] font-semibold text-faint">
            Export unavailable
          </span>
        )}
      </GrowthPageHeader>

      {!directory.complete ? (
        <p className="mt-4 rounded-xl border border-rust bg-white px-4 py-3 text-[13px] leading-relaxed text-ink">
          <strong className="font-bold text-rust">Not fully synced.</strong>{" "}
          {directory.lastSyncAt === null
            ? "No sync has ever run, so nothing here has been compared against the sending platform and anyone who signed up before the mirror existed is missing entirely."
            : `${directory.unsynced} ${directory.unsynced === 1 ? "row has" : "rows have"} never been confirmed against the sending platform.`}{" "} Counts are lower bounds and
          export is withheld — a spreadsheet has nowhere to carry this warning.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <form action="/admin/growth/waitlist" className="min-w-[230px]">
          <input type="hidden" name="population" value={population} />
          {segment !== "all" ? <input type="hidden" name="segment" value={segment} /> : null}
          {source !== "all" ? <input type="hidden" name="source" value={source} /> : null}
          <SearchField
            name="q"
            defaultValue={q}
            placeholder="Search number, name or email…"
            className="h-10"
          />
        </form>

        {/* Role pills are neutral, never amber — the one amber mark in this shell
            is the active sidebar item (the same rule /admin/customers follows). */}
        <div className="inline-flex rounded-pill border border-ink bg-white p-0.5">
          {[{ value: "all", label: "All" }, ...WAITLIST_SEGMENT_OPTIONS].map((option) => (
            <a
              key={option.value}
              href={linkTo({ segment: option.value, page: undefined })}
              aria-current={segment === option.value ? "true" : undefined}
              className={`flex h-8 items-center rounded-pill px-3.5 text-[13px] font-semibold ${
                segment === option.value ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {option.label}
            </a>
          ))}
        </div>

        <PopulationFilter
          basePath="/admin/growth/waitlist"
          population={population}
          params={{ segment: segment === "all" ? undefined : segment, q: q || undefined }}
        />

        {sources.length > 0 ? (
          <form action="/admin/growth/waitlist" className="flex items-center">
            <input type="hidden" name="population" value={population} />
            {segment !== "all" ? <input type="hidden" name="segment" value={segment} /> : null}
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <label className="sr-only" htmlFor="source">
              Filter by source
            </label>
            <select
              id="source"
              name="source"
              defaultValue={source}
              className="h-10 rounded-xl border border-line bg-white px-3 text-[13px] font-medium text-ink focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2"
            >
              <option value="all">Any source</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="ml-2 h-10 rounded-pill border border-ink px-3.5 text-[13px] font-semibold text-ink hover:bg-stone"
            >
              Apply
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto rounded-card bg-white shadow-card">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-paper">
              {["Number", "Name", "Role", "Mall", "Source", "Consent", "Joined", "Flags"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
                  No entries match this view.
                </td>
              </tr>
            ) : (
              rows.map((entry) => <WaitlistRow key={entry.id} entry={entry} />)
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-muted">
          Showing {rows.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1}–
          {(current - 1) * PAGE_SIZE + rows.length} of {filtered.length}
          {directory.complete ? "" : "+"}.{" "}
          <span className={population === "real" ? "text-muted" : "font-semibold text-rust"}>
            {POPULATION_FOOTNOTE[population]}
          </span>
        </p>
        {totalPages > 1 ? (
          <nav className="flex items-center gap-1.5" aria-label="Pagination">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => Math.abs(n - current) < 3 || n === 1 || n === totalPages)
              .map((n) => (
                <a
                  key={n}
                  href={linkTo({ page: n })}
                  aria-current={n === current ? "page" : undefined}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-semibold ${
                    n === current
                      ? "bg-ink text-white"
                      : "border border-line bg-white text-ink hover:bg-stone"
                  }`}
                >
                  {n}
                </a>
              ))}
          </nav>
        ) : null}
      </div>
    </main>
  );
}

function WaitlistRow({ entry }: { entry: WaitlistEntry }) {
  const masked = maskPhone(entry.phone);
  return (
    <tr
      className={`border-b border-line last:border-0 ${
        // Three signals on a test row: the rust bar, the badge, the label.
        entry.isTest ? "border-l-[3px] border-l-rust bg-brand-tint/40" : ""
      }`}
    >
      <td className="px-4 py-3">
        {entry.phone && masked ? (
          <RevealNumber contactId={entry.id} masked={masked} />
        ) : entry.propertiesUnreadable ? (
          <span className="text-xs text-rust">unreadable</span>
        ) : (
          <span className="text-muted">—</span>
        )}
        <span className="mt-0.5 block truncate text-[11px] text-faint">{entry.email}</span>
      </td>
      <td className="px-4 py-3 text-ink">{entry.name ?? <span className="text-muted">—</span>}</td>
      <td className="px-4 py-3 text-[13px] font-medium text-ink">
        {entry.segment ? (
          SEGMENT_LABEL[entry.segment]
        ) : entry.propertiesUnreadable ? (
          <span className="text-rust">unreadable</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-[13px] text-secondary">{entry.nodeInterest ?? "—"}</td>
      <td className="px-4 py-3 font-mono text-xs text-secondary">
        {entry.source ?? <GrowthBadge tone="error">unattributed</GrowthBadge>}
      </td>
      <td className="px-4 py-3 text-xs font-semibold">
        {entry.propertiesUnreadable ? (
          <span className="text-rust">unreadable</span>
        ) : entry.consentAt ? (
          <span className="text-verified">Recorded</span>
        ) : (
          <GrowthBadge tone="error">Missing</GrowthBadge>
        )}
      </td>
      <td className="px-4 py-3 text-[13px] text-muted">
        {entry.joinedAt ? (
          entry.joinedAt.slice(0, 10)
        ) : (
          // Not a fabricated date. The mirror has not read it from the sending
          // platform yet, and our own row-creation clock is a different fact.
          <span className="text-rust">not synced</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="flex flex-wrap gap-1.5">
          {entry.isTest ? <GrowthBadge tone="test">Test</GrowthBadge> : null}
          {entry.testLabel ? <GrowthBadge tone="caution">{entry.testLabel}</GrowthBadge> : null}
          {entry.flags.includes("duplicate") ? (
            <GrowthBadge tone="caution">Duplicate</GrowthBadge>
          ) : null}
          {entry.flags.includes("no_consent") ? (
            <GrowthBadge tone="error">No consent</GrowthBadge>
          ) : null}
          {entry.flags.includes("unreadable") ? (
            <GrowthBadge tone="caution">Metadata unreadable</GrowthBadge>
          ) : null}
        </span>
      </td>
    </tr>
  );
}
