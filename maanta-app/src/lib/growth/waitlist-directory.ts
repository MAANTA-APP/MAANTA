import { createServiceClient } from "@/lib/supabase/service";
import { isWaitlistSegment, type WaitlistSegment } from "@/lib/waitlist";
import { inPopulation, type Population } from "@/lib/growth/population";

/**
 * The admin read model over the waitlist.
 *
 * It used to walk the Resend audience one contact at a time, because Resend's
 * list endpoint returns no custom properties — which forced a 500-contact cap
 * and a permanently partial view (D261). Since the founder's 2026-09-04 ruling
 * the signup is mirrored into `public.waitlist_signups`, so this is now one
 * unbounded PostgREST select, filtered and grouped in the app the same way
 * `readLeads` does it.
 *
 * ## What `complete` means now
 *
 * It no longer means "the read was not truncated" — an unbounded select always
 * returns every row. It means **the mirror is known to hold everyone Resend
 * holds**, which is a different and still-necessary caveat: the mirror only
 * started collecting at the cutover, so every contact that signed up before it
 * has to be imported by the sync pass, and until that has run the counts here
 * are a lower bound.
 *
 * Re-pointing the existing flag rather than inventing a second one is
 * deliberate: every surface already renders it, and the four register rows about
 * quoting a partial read as a total (D244, D248, D254, D255) keep their guard.
 */

export type WaitlistFlag =
  | "test"
  | "duplicate"
  | "no_consent"
  | "unattributed"
  | "unreadable"
  | "unsynced";

export type WaitlistEntry = {
  id: string;
  phone: string | null;
  name: string | null;
  email: string;
  segment: WaitlistSegment | null;
  nodeInterest: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  consentAt: string | null;
  /**
   * When Resend says they joined. **Null until a sync reads it.**
   *
   * Resend's create response carries no `created_at`, so at signup time we do
   * not know it, and on an `already_exists` submission the real date may be
   * months old. Null is the honest value; `NOW()` would have moved historical
   * signups into today's chart.
   */
  joinedAt: string | null;
  /** When the mirror row was written. Always known — but it is OUR clock. */
  recordedAt: string;
  isTest: boolean;
  testLabel: string | null;
  flags: WaitlistFlag[];
  /**
   * Resend held this contact but its properties could not be read — including
   * an empty properties object, which is the footprint of the strip-and-retry
   * in `addWaitlistContact`. "We could not read it" and "they did not provide
   * it" are different facts and only one of them is a consent defect.
   */
  propertiesUnreadable: boolean;
};

export type WaitlistDirectory = {
  entries: WaitlistEntry[];
  /** False when the mirror is not yet known to hold everyone Resend holds. */
  complete: boolean;
  /** False when the database read itself failed. Never rendered as zero. */
  readable: boolean;
  /** Rows the sync pass has never confirmed against Resend. */
  unsynced: number;
  /** When a confirmed sync last ran, or null if one never has. */
  lastSyncAt: string | null;
};

/** Map a mirror row onto the console's row. Pure. */
export function toWaitlistEntry(row: Record<string, unknown>): WaitlistEntry {
  const segment = row.segment;
  const source = (row.utm_source as string | null) ?? null;
  const consentAt = (row.consent_at as string | null) ?? null;
  const unreadable = Boolean(row.properties_unreadable);
  const isTest = Boolean(row.is_test);
  const synced = Boolean(row.resend_synced_at);

  const flags: WaitlistFlag[] = [];
  if (isTest) flags.push("test");
  if (unreadable) flags.push("unreadable");
  // Only assert a missing consent or attribution when the row's metadata was
  // actually readable — otherwise our own failed read renders as their defect.
  if (!unreadable && !consentAt) flags.push("no_consent");
  if (!unreadable && !source) flags.push("unattributed");
  if (!synced) flags.push("unsynced");

  return {
    id: String(row.id),
    phone: (row.phone as string | null) ?? null,
    name: (row.full_name as string | null) ?? null,
    email: String(row.email ?? ""),
    segment: isWaitlistSegment(segment) ? segment : null,
    nodeInterest: (row.node_interest as string | null) ?? null,
    source,
    medium: (row.utm_medium as string | null) ?? null,
    campaign: (row.utm_campaign as string | null) ?? null,
    consentAt,
    joinedAt: (row.joined_at as string | null) ?? null,
    recordedAt: String(row.created_at),
    isTest,
    testLabel: (row.test_label as string | null) ?? null,
    flags,
    propertiesUnreadable: unreadable,
  };
}

/**
 * Flag rows that share a phone number. Pure, and deliberately phone-based: two
 * people legitimately share a household email far more often than a handset,
 * and the phone is the identifier the counter actually uses.
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

/** Apply the toolbar. Pure. */
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

export type SignupsByDay = {
  buckets: { day: string; shopper: number; merchant: number; mall_operator: number }[];
  /**
   * People whose join date the mirror has not read from Resend yet. They are
   * NOT in the buckets, and the chart says so rather than quietly undercounting
   * — a bare `continue` on a null date is how a person disappears from a figure
   * with nothing on screen admitting it.
   */
  unknownJoinDate: number;
};

/** Daily signup counts by role over a window, oldest first. Pure. */
export function signupsByDay(
  entries: WaitlistEntry[],
  days: number,
  now: Date = new Date()
): SignupsByDay {
  const buckets: SignupsByDay["buckets"] = [];
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    index.set(d, buckets.length);
    buckets.push({ day: d, shopper: 0, merchant: 0, mall_operator: 0 });
  }

  let unknownJoinDate = 0;
  for (const e of entries) {
    if (!e.joinedAt) {
      unknownJoinDate += 1;
      continue;
    }
    const slot = index.get(e.joinedAt.slice(0, 10));
    if (slot === undefined || !e.segment) continue;
    buckets[slot][e.segment] += 1;
  }
  return { buckets, unknownJoinDate };
}

/** Attribution roll-up, busiest first, with unattributed counted separately. */
export function attributionRollup(entries: WaitlistEntry[]) {
  const rows = new Map<
    string,
    { source: string; medium: string | null; campaign: string | null; count: number }
  >();
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
  "recorded_at",
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
 * name is attacker-supplied free text and this file gets opened in Excel.
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
        // Empty, not a fabricated date: an unread join date must not become a
        // real-looking value the moment it reaches a spreadsheet.
        e.joinedAt ?? "",
        e.recordedAt,
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

/**
 * Read the whole mirror.
 *
 * Unbounded, like `readLeads`: this is one mall's pre-launch waitlist, the row
 * count is bounded by the cohort, and a capped read is what produced D261 in the
 * first place. If this ever needs a limit, it needs pagination in SQL and a
 * `complete: false` alongside it — never a silent slice.
 */
export async function loadWaitlistDirectory(): Promise<WaitlistDirectory> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("waitlist_signups")
    .select(
      "id, email, full_name, phone, segment, node_interest, utm_source, utm_medium, utm_campaign, consent_at, is_test, test_label, properties_unreadable, resend_synced_at, joined_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    // Log the code, never the message: on a table whose unique key is an email
    // address, a constraint error renders the address verbatim (SEC-011).
    console.error("growth: waitlist mirror read failed", { code: error.code });
    return { entries: [], complete: false, readable: false, unsynced: 0, lastSyncAt: null };
  }

  const entries = markDuplicates((data ?? []).map(toWaitlistEntry));
  const unsynced = entries.filter((e) => e.flags.includes("unsynced")).length;

  /*
   * `unsynced === 0` alone is not enough, and the empty table is exactly why.
   *
   * Before any sync has run the mirror holds nothing, so nothing is unsynced,
   * so a count-only test would report the mirror COMPLETE — the most confident
   * possible statement about a table that has never been compared to Resend,
   * and it would unlock CSV export at the same time. That is the failure class
   * the register already carries four rows for (D242, D246, D251, D253).
   *
   * So completeness also requires evidence that a confirmed sync happened. That
   * evidence is derived from the audit trail the sync route already writes,
   * rather than from a new `app_config` key: nothing in this repo writes
   * `app_config` from a route, and `/admin/operations` tells operators outright
   * that "no console control writes it".
   */
  const { data: lastSync, error: syncError } = await service
    .from("admin_ops_log")
    .select("created_at")
    .eq("action", "growth.waitlist.sync")
    .order("created_at", { ascending: false })
    .limit(1);

  if (syncError) {
    console.error("growth: sync-history read failed", { code: syncError.code });
  }
  const lastSyncAt = lastSync && lastSync.length > 0 ? String(lastSync[0].created_at) : null;

  return {
    entries,
    // Known to hold everyone only when a confirmed sync has run AND every row
    // it holds has been confirmed against Resend. An unreadable sync history is
    // treated as "no evidence", which is the safe direction.
    complete: lastSyncAt !== null && unsynced === 0,
    readable: true,
    unsynced,
    lastSyncAt,
  };
}
