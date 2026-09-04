import {
  getAudienceContact,
  isResendConfigured,
  listAudienceContacts,
  type ResendContactSummary,
} from "@/lib/resend";
import { normalizeWaitlistPhone, type WaitlistSegment, isWaitlistSegment } from "@/lib/waitlist";
import { inPopulation, type Population } from "@/lib/growth/population";

/**
 * The admin read model over the Resend waitlist audience.
 *
 * The store is Resend, not Supabase (founder decision 2026-07-10), and the
 * audience list endpoint returns core fields only — see the read-side block in
 * `lib/resend.ts`. Everything the console shows beyond name and join date is a
 * custom property, so building this directory costs one list call plus one call
 * per contact.
 *
 * That cost is the reason for the two rules this module enforces:
 *
 * 1. **The read is capped** at `MAX_DIRECTORY_CONTACTS`, and
 * 2. **a capped read never reports a confident total.** `complete: false` means
 *    the counts are lower bounds and every surface that renders them has to say
 *    so. The register records four separate occasions where a capped page was
 *    quoted as a live total (D244, D248, D254, D255); this module is written so
 *    that mistake is not available to its callers.
 */

/** One page of Resend's list endpoint. */
const PAGE_SIZE = 100;

/**
 * How many contacts the console will assemble in one request. Node 0 is
 * pre-launch and the audience is in the low hundreds, so this is generous
 * today. It is a cap, not a capacity plan: past it the console tells the
 * operator the view is partial rather than silently truncating.
 */
export const MAX_DIRECTORY_CONTACTS = 500;

/**
 * Per-contact hydration runs this many at a time. Sequential would be one
 * 10-second timeout per row in the worst case; unbounded would open 500 sockets
 * and invite Resend's own rate limiting.
 */
const HYDRATION_CONCURRENCY = 8;

/** In-process cache. Changing a filter must not re-walk the whole audience. */
const CACHE_TTL_MS = 60_000;

export type WaitlistFlag = "test" | "duplicate" | "no_consent" | "unattributed" | "unsubscribed";

export type WaitlistEntry = {
  id: string;
  /** Masked at render; the raw value never leaves the server unrevealed. */
  phone: string | null;
  name: string | null;
  email: string;
  segment: WaitlistSegment | null;
  nodeInterest: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  consentAt: string | null;
  joinedAt: string;
  isTest: boolean;
  testLabel: string | null;
  flags: WaitlistFlag[];
  /**
   * True when this row's property-backed columns could not be read. The row is
   * still shown — a person who signed up exists whether or not their metadata
   * loaded — but its segment, source and consent read as unknown rather than as
   * absent, which are different facts.
   */
  propertiesUnreadable: boolean;
};

export type WaitlistDirectory = {
  entries: WaitlistEntry[];
  /** False when the audience is larger than the cap, or a page failed. */
  complete: boolean;
  /** Null when Resend could not be read at all. */
  readable: boolean;
};

const str = (props: Record<string, unknown> | null, key: string): string | null => {
  const v = props?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

const bool = (props: Record<string, unknown> | null, key: string): boolean => {
  const v = props?.[key];
  return v === true || v === "true";
};

/**
 * Property key marking an internal test signup.
 *
 * The founder's TEST treatment (2026-09-04) runs internal waitlist tests through
 * the real form, so the marker has to travel with the contact rather than live in
 * an admin-side allow-list of phone numbers — an allow-list drifts the moment
 * someone tests with a number nobody wrote down.
 */
export const WAITLIST_TEST_PROPERTY = "is_test";
export const WAITLIST_TEST_LABEL_PROPERTY = "test_label";

/** Normalize one Resend contact into a console row. Pure. */
export function toWaitlistEntry(
  summary: ResendContactSummary,
  properties: Record<string, unknown> | null,
  propertiesUnreadable: boolean
): WaitlistEntry {
  const name =
    [summary.first_name, summary.last_name].filter(Boolean).join(" ").trim() || null;
  const rawSegment = str(properties, "segment_type");
  const source = str(properties, "source_channel");
  const consentAt = str(properties, "consent_at");
  const isTest = bool(properties, WAITLIST_TEST_PROPERTY);

  const flags: WaitlistFlag[] = [];
  if (isTest) flags.push("test");
  // Only assert a missing consent when the properties were actually readable —
  // otherwise "we could not read it" would render as a compliance defect.
  if (!propertiesUnreadable && !consentAt) flags.push("no_consent");
  if (!propertiesUnreadable && !source) flags.push("unattributed");
  if (summary.unsubscribed) flags.push("unsubscribed");

  return {
    id: summary.id,
    phone: normalizeWaitlistPhone(str(properties, "phone")),
    name,
    email: summary.email,
    segment: isWaitlistSegment(rawSegment) ? rawSegment : null,
    nodeInterest: str(properties, "node_interest"),
    source,
    medium: str(properties, "source_medium"),
    campaign: str(properties, "source_campaign"),
    consentAt,
    joinedAt: summary.created_at,
    isTest,
    testLabel: str(properties, WAITLIST_TEST_LABEL_PROPERTY),
    flags,
    propertiesUnreadable,
  };
}

/**
 * Flag rows that share a phone number. Pure, and deliberately phone-based: two
 * people legitimately share a household email far more often than a handset, and
 * the phone is the identifier the counter actually uses.
 */
export function markDuplicates(entries: WaitlistEntry[]): WaitlistEntry[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.phone) counts.set(e.phone, (counts.get(e.phone) ?? 0) + 1);
  }
  return entries.map((e) =>
    e.phone && (counts.get(e.phone) ?? 0) > 1 && !e.flags.includes("duplicate")
      ? { ...e, flags: [...e.flags, "duplicate" as const] }
      : e
  );
}

export type WaitlistFilters = {
  population: Population;
  segment?: WaitlistSegment | "all";
  source?: string | "all";
  q?: string;
};

/** Apply the toolbar to the directory. Pure. */
export function filterEntries(
  entries: WaitlistEntry[],
  filters: WaitlistFilters
): WaitlistEntry[] {
  const q = filters.q?.trim().toLowerCase();
  return entries.filter((e) => {
    if (!inPopulation(e.isTest, filters.population)) return false;
    if (filters.segment && filters.segment !== "all" && e.segment !== filters.segment) return false;
    if (filters.source && filters.source !== "all" && e.source !== filters.source) return false;
    if (q) {
      const hay = [e.name, e.email, e.phone, e.campaign].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Distinct sources present, for the "Any source" dropdown. Pure. */
export function sourcesIn(entries: WaitlistEntry[]): string[] {
  const sources = entries.map((e) => e.source).filter((s): s is string => Boolean(s));
  return Array.from(new Set(sources)).sort();
}

/** Role split, for the overview's stacked bar. Pure. */
export function segmentCounts(entries: WaitlistEntry[]) {
  return {
    shopper: entries.filter((e) => e.segment === "shopper").length,
    merchant: entries.filter((e) => e.segment === "merchant").length,
    mall_operator: entries.filter((e) => e.segment === "mall_operator").length,
    unknown: entries.filter((e) => e.segment === null).length,
  };
}

/**
 * Daily signup counts by role over a window, oldest first. Pure — the chart
 * renders whatever this returns and computes nothing itself.
 */
export function signupsByDay(entries: WaitlistEntry[], days: number, now: Date = new Date()) {
  const buckets: { day: string; shopper: number; merchant: number; mall_operator: number }[] = [];
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    index.set(d, buckets.length);
    buckets.push({ day: d, shopper: 0, merchant: 0, mall_operator: 0 });
  }
  for (const e of entries) {
    const slot = index.get(e.joinedAt.slice(0, 10));
    if (slot === undefined || !e.segment) continue;
    buckets[slot][e.segment] += 1;
  }
  return buckets;
}

/** Attribution roll-up, busiest first, with unattributed counted separately. */
export function attributionRollup(entries: WaitlistEntry[]) {
  const rows = new Map<string, { source: string; medium: string | null; campaign: string | null; count: number }>();
  let unattributed = 0;
  for (const e of entries) {
    if (!e.source) {
      unattributed += 1;
      continue;
    }
    const key = `${e.source}|${e.medium ?? ""}|${e.campaign ?? ""}`;
    const row = rows.get(key);
    if (row) row.count += 1;
    else rows.set(key, { source: e.source, medium: e.medium, campaign: e.campaign, count: 1 });
  }
  return {
    rows: Array.from(rows.values()).sort((a, b) => b.count - a.count),
    unattributed,
  };
}

const CSV_COLUMNS = [
  "joined_at",
  "segment",
  "name",
  "email",
  "phone",
  "node_interest",
  "source",
  "medium",
  "campaign",
  "consent_at",
  "is_test",
  "test_label",
  "flags",
] as const;

/**
 * CSV for the current filter. The caller passes already-filtered rows, so an
 * export can never contain a population the operator was not looking at.
 *
 * Every cell is quoted and inner quotes doubled; a leading `=`, `+`, `-` or `@`
 * is prefixed with a single quote so a spreadsheet treats it as text. A waitlist
 * note is attacker-supplied free text and this file gets opened in Excel.
 */
export function toCsv(entries: WaitlistEntry[]): string {
  const cell = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${guarded.replace(/"/g, '""')}"`;
  };
  const lines = [CSV_COLUMNS.join(",")];
  for (const e of entries) {
    lines.push(
      [
        e.joinedAt,
        e.segment ?? "",
        e.name ?? "",
        e.email,
        e.phone ?? "",
        e.nodeInterest ?? "",
        e.source ?? "",
        e.medium ?? "",
        e.campaign ?? "",
        e.consentAt ?? "",
        e.isTest ? "true" : "false",
        e.testLabel ?? "",
        e.flags.join(" "),
      ]
        .map(cell)
        .join(",")
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** Run `worker` over `items`, at most `limit` in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

let cache: { at: number; value: WaitlistDirectory } | null = null;

/** Drop the cached directory — used after a write so the console re-reads. */
export function invalidateWaitlistDirectory() {
  cache = null;
}

/**
 * Assemble the directory: page the audience, hydrate each contact's properties,
 * normalize, and mark duplicates across the whole set.
 *
 * `complete` is false if the audience exceeded the cap or any page failed, and
 * every caller must render that rather than a confident total.
 */
export async function loadWaitlistDirectory(
  options: { force?: boolean } = {}
): Promise<WaitlistDirectory> {
  if (!options.force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  if (!isResendConfigured()) {
    return { entries: [], complete: false, readable: false };
  }

  const summaries: ResendContactSummary[] = [];
  let after: string | undefined;
  let complete = true;

  while (summaries.length < MAX_DIRECTORY_CONTACTS) {
    const page = await listAudienceContacts({ limit: PAGE_SIZE, after });
    if (!page) {
      // A failed first page is a read failure; a failed later page is a partial
      // read. Neither may be reported as a total.
      if (summaries.length === 0) return { entries: [], complete: false, readable: false };
      complete = false;
      break;
    }
    summaries.push(...page.contacts);
    if (!page.hasMore || page.contacts.length === 0) break;
    after = page.contacts[page.contacts.length - 1]?.id;
    if (!after) break;
    if (summaries.length >= MAX_DIRECTORY_CONTACTS) {
      complete = false;
      break;
    }
  }

  const capped = summaries.slice(0, MAX_DIRECTORY_CONTACTS);
  const hydrated = await mapWithConcurrency(capped, HYDRATION_CONCURRENCY, async (summary) => {
    const detail = await getAudienceContact(summary.id);
    // `properties: null` from a successful read means this Resend account does
    // not return custom properties on the single-contact endpoint; a null detail
    // means the call itself failed. Both leave the columns unreadable, and
    // neither is allowed to look like "the field is empty".
    return toWaitlistEntry(summary, detail?.properties ?? null, !detail || detail.properties === null);
  });

  const value: WaitlistDirectory = {
    entries: markDuplicates(hydrated),
    complete,
    readable: true,
  };
  cache = { at: Date.now(), value };
  return value;
}
