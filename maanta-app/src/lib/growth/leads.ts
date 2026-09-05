import { RESPONSE_TIMES } from "@/lib/marketing/facts";

/**
 * Merchant leads — the acquisition board behind `/admin/growth/leads`.
 *
 * Two product rules from the design board, both of which are really data rules:
 *
 * **A lead is a unit on a floor, not a brand.** Cards lead with `GF · Unit 12`,
 * because that is how an agent covers a mall — and because inventing shop names
 * for prospects who have not signed anything is exactly the fabrication the
 * pre-launch claims discipline exists to prevent. `floor` + `unit` are the
 * identity; `category` is what is sold there; a name is optional and only ever
 * the contact's, never a trading name MAANTA made up.
 *
 * **The SLA is the promise the site already makes.** Overdue is measured against
 * `RESPONSE_TIMES.form` — the 1-business-day reply published on `/merchants` and
 * `/contact` — so the console holds the company to its own copy rather than to a
 * private internal target that could be quietly relaxed.
 */

export const LEAD_STAGES = [
  "new",
  "contacted",
  "visit_booked",
  "onboarding",
  "ready_to_publish",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  visit_booked: "Visit booked",
  onboarding: "Onboarding",
  ready_to_publish: "Ready to publish",
  lost: "Lost",
};

export function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === "string" && (LEAD_STAGES as readonly string[]).includes(value);
}

/**
 * Closed list. A free-text reason becomes a hundred spellings of "no answer" and
 * cannot be counted, and "why did they say no" is the single most valuable thing
 * cohort one produces.
 */
export const LEAD_LOST_REASONS = [
  "not_interested",
  "unit_vacant",
  "wrong_number",
  "asked_us_to_stop",
] as const;
export type LeadLostReason = (typeof LEAD_LOST_REASONS)[number];

export const LEAD_LOST_REASON_LABELS: Record<LeadLostReason, string> = {
  not_interested: "Not interested",
  unit_vacant: "Unit vacant",
  wrong_number: "Wrong number",
  asked_us_to_stop: "Asked us to stop",
};

export function isLeadLostReason(value: unknown): value is LeadLostReason {
  return typeof value === "string" && (LEAD_LOST_REASONS as readonly string[]).includes(value);
}

/** BBS Mall's floors. Node 0 is one building; a second node adds its own list. */
export const LEAD_FLOORS = ["GF", "1F", "2F"] as const;
export type LeadFloor = (typeof LEAD_FLOORS)[number];

export const LEAD_FLOOR_LABELS: Record<LeadFloor, string> = {
  GF: "Ground floor",
  "1F": "First floor",
  "2F": "Second floor",
};

export function isLeadFloor(value: unknown): value is LeadFloor {
  return typeof value === "string" && (LEAD_FLOORS as readonly string[]).includes(value);
}

export type MerchantLead = {
  id: string;
  floor: LeadFloor;
  unit: string;
  category: string | null;
  contactName: string | null;
  contactPhone: string | null;
  stage: LeadStage;
  lostReason: LeadLostReason | null;
  agentUserId: string | null;
  visitAt: string | null;
  /** Onboarding checklist, only meaningful in the `onboarding` stage. */
  accountCreated: boolean;
  staffAdded: boolean;
  walletToppedUp: boolean;
  isTest: boolean;
  /**
   * The `public.leads` row for this unit, once a field agent captures it (D265).
   * Null until the four-agent phase begins — that phase is gated behind D159.
   */
  capturedLeadId: string | null;
  createdAt: string;
  firstContactedAt: string | null;
};

/** `GF · Unit 12` — the one way a lead is named, everywhere. */
export function leadAddress(lead: Pick<MerchantLead, "floor" | "unit">): string {
  return `${lead.floor} · Unit ${lead.unit}`;
}

/**
 * Business days between two instants, counting Mon–Fri only.
 *
 * `RESPONSE_TIMES` is explicit that these are business days, "so a Saturday
 * enquiry is not a missed promise". A naive 24-hour clock would mark every
 * Friday-afternoon lead overdue on Sunday and produce a weekly false alarm the
 * operator would learn to ignore — which is worse than no alert.
 */
export function businessDaysElapsed(from: string | Date, now: Date = new Date()): number {
  const start = typeof from === "string" ? new Date(from) : from;
  if (Number.isNaN(start.getTime()) || now <= start) return 0;

  let elapsedMs = 0;
  const cursor = new Date(start.getTime());
  while (cursor < now) {
    // Walk to the end of this calendar day, or to `now`, whichever is sooner.
    const dayEnd = new Date(cursor);
    dayEnd.setUTCHours(24, 0, 0, 0);
    const sliceEnd = dayEnd < now ? dayEnd : now;
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) elapsedMs += sliceEnd.getTime() - cursor.getTime();
    cursor.setTime(sliceEnd.getTime());
  }
  return elapsedMs / 86_400_000;
}

/** The published promise, as a number of business days. Parsed, never retyped. */
export const LEAD_REPLY_SLA_BUSINESS_DAYS = (() => {
  const match = /^(\d+)\s+business day/.exec(RESPONSE_TIMES.form);
  // `RESPONSE_TIMES.form` is founder-set copy. If its shape ever changes, fail
  // loudly at import rather than silently defaulting to a target nobody chose.
  if (!match) throw new Error(`Unparseable RESPONSE_TIMES.form: ${RESPONSE_TIMES.form}`);
  return Number(match[1]);
})();

/**
 * Has this lead missed the published reply promise?
 *
 * Only `new` leads can be overdue: the promise is about the *first* reply, and a
 * lead that has been contacted has been replied to. A lead already marked lost
 * is out of the count entirely.
 */
export function isOverdue(lead: MerchantLead, now: Date = new Date()): boolean {
  if (lead.stage !== "new" || lead.firstContactedAt) return false;
  return businessDaysElapsed(lead.createdAt, now) > LEAD_REPLY_SLA_BUSINESS_DAYS;
}

/** Compact age for a card: `4h`, `2d`. Business days for the day figure. */
export function leadAgeLabel(lead: MerchantLead, now: Date = new Date()): string {
  const days = businessDaysElapsed(lead.createdAt, now);
  if (days < 1) {
    const hours = Math.max(1, Math.floor(days * 24));
    return `${hours}h`;
  }
  return `${Math.floor(days)}d`;
}

/**
 * Onboarding steps still outstanding. Drives the "1 step left" chip, which is
 * the one amber-bordered card on the board — a shop one step from being able to
 * publish is the single most actionable thing on the screen.
 */
export function onboardingStepsLeft(lead: MerchantLead): number {
  return [lead.accountCreated, lead.staffAdded, lead.walletToppedUp].filter((done) => !done).length;
}

export type LeadPipeline = {
  stage: LeadStage;
  label: string;
  count: number;
  leads: MerchantLead[];
}[];

/** Group leads into board columns, in canonical stage order. Pure. */
export function pipelineFrom(leads: MerchantLead[]): LeadPipeline {
  return LEAD_STAGES.map((stage) => {
    const inStage = leads.filter((l) => l.stage === stage);
    return {
      stage,
      label: LEAD_STAGE_LABELS[stage],
      count: inStage.length,
      // Overdue first inside New — the design board pins them to the top.
      leads: inStage.sort((a, b) => {
        const overdue = Number(isOverdue(b)) - Number(isOverdue(a));
        return overdue !== 0 ? overdue : a.createdAt.localeCompare(b.createdAt);
      }),
    };
  });
}

/** Floor coverage for the overview card: interest registered, per floor. */
export function coverageByFloor(leads: MerchantLead[]): Record<LeadFloor, number> {
  return {
    GF: leads.filter((l) => l.floor === "GF" && l.stage !== "lost").length,
    "1F": leads.filter((l) => l.floor === "1F" && l.stage !== "lost").length,
    "2F": leads.filter((l) => l.floor === "2F" && l.stage !== "lost").length,
  };
}

/** Map a database row onto the domain type. One place, so a column rename bites once. */
export function rowToLead(row: Record<string, unknown>): MerchantLead {
  const floor = row.floor;
  const stage = row.stage;
  return {
    id: String(row.id),
    floor: isLeadFloor(floor) ? floor : "GF",
    unit: String(row.unit ?? ""),
    category: (row.category as string | null) ?? null,
    contactName: (row.contact_name as string | null) ?? null,
    contactPhone: (row.contact_phone as string | null) ?? null,
    stage: isLeadStage(stage) ? stage : "new",
    lostReason: isLeadLostReason(row.lost_reason) ? row.lost_reason : null,
    agentUserId: (row.agent_user_id as string | null) ?? null,
    visitAt: (row.visit_at as string | null) ?? null,
    accountCreated: Boolean(row.account_created),
    staffAdded: Boolean(row.staff_added),
    walletToppedUp: Boolean(row.wallet_topped_up),
    isTest: Boolean(row.is_test),
    capturedLeadId: (row.captured_lead_id as string | null) ?? null,
    createdAt: String(row.created_at),
    firstContactedAt: (row.first_contacted_at as string | null) ?? null,
  };
}
