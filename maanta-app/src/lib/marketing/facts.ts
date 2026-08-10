import { SUCCESS_FEE_KES } from "@/lib/pricing";

/**
 * Verified product facts — the single source for every number on the marketing
 * site. Traceable to `docs/ops/website-ia.md` §2, which lists what was verified
 * against the live product. Nothing may be added here that is not verified.
 *
 * "One number, one source" is the whole point: `docs/ops/website-handoff.md` §2
 * records that the boost price already disagreed across two public pages
 * (drift D34), which is what happens when a price is typed rather than imported.
 *
 * **`successFeeKes` is re-exported, not re-declared.** The handoff's starter code
 * writes `successFeeKes: 30` as a literal, but `SUCCESS_FEE_KES` already exists in
 * `@/lib/pricing` as the frozen constant, is asserted against `app_config` by
 * `success-fee-copy.test.ts`, and its own doc comment says it is "the single
 * literal that static/public copy is allowed to render". A second `30` here would
 * be a second place for the frozen fee to drift from the database — precisely the
 * failure both modules exist to prevent. Deviation recorded in
 * `docs/ops/IMPLEMENTATION-REPORT.md` §5.
 */
export const FACTS = {
  /** KES per verified redemption, all plans. Frozen; see `@/lib/pricing`. */
  successFeeKes: SUCCESS_FEE_KES,
  elitePerMonthKes: 3_500,
  /** Canonical value lives in `app_config.boost_fee_kes` (migration 20260709175532). */
  boostPer24hKes: 500,
  boostHours: 24,
  codeLength: 6,
  graceMinutes: 15,
  standardActiveDeals: 1,
  eliteActiveDeals: 2,
  launchMall: "BBS Mall, Eastleigh",
  city: "Nairobi",
  nodeLabel: "Node 0",
} as const;

/**
 * Which plans a feature is available on — resolved in Phase 0 by reading the
 * migrations rather than the marketing pages, because the two disagreed.
 *
 * `boosts`: Elite only. `purchase_boost` raises `BOOST_ELITE_ONLY` for any
 * non-Elite merchant and the gate is explicitly NOT bypassed by admin or
 * service_role (migration 20260715194145_boost_elite_only_gate.sql).
 *
 * `staff`: all plans. `merchant_staff` carries per-permission booleans
 * (`can_verify`, `can_deals`, `can_topup`, `can_purchase`) and no tier column;
 * no plan gate exists in the schema or in `/api/staff`
 * (migration 20260709175532_deal_pause_boosts_staff.sql).
 *
 * These resolve `{{BOOST_PLAN_AVAILABILITY}}` and `{{STAFF_PLAN_AVAILABILITY}}`
 * from the token register (`website-handoff.md` §8).
 */
export const PLAN_AVAILABILITY = {
  boosts: "elite",
  staff: "all",
} as const;

/**
 * M-Pesa top-up mechanism — STK push via IntaSend (`initiateMpesaStkPush` in
 * `@/lib/intasend`). There is no paybill path. Resolves Phase 0 question 13, and
 * governs the wallet microcopy in `copy/merchants.md` `#wallet`: a merchant gets
 * a prompt on their handset, they do not type a paybill number.
 */
export const TOPUP_METHOD = "stk-push" as const;

/**
 * Time-bound offers. Rendered conditionally through `isOfferLive`, so an offer
 * whose date has passed — or was never set — disappears instead of going stale
 * on the page. Risk R7 in `website-expansion-plan.md` §5.
 *
 * Both dates were set on 2026-07-31 by founder ruling. The gate stays in place
 * regardless: an offer with no end date is an unbounded promise, and one whose
 * date has passed must vanish rather than sit there stale (risk R7).
 */
export const OFFERS = {
  openingCredit: {
    amountKes: 300,
    cohortShops: 100,
    // Set 2026-07-31 from the founder's ruling. This is a public commercial
    // promise: when the date passes the whole block disappears rather than
    // going stale, and extending it is a one-line change here.
    expiresOn: "2026-10-31",
  },
  eliteTrial: {
    days: 30,
    postTrialGraceDays: 7,
    cohortShops: 100,
    expiresOn: "2026-10-31",
  },
} as const;

/**
 * An offer is live only when its expiry is a real future date. An unfilled
 * `{{TOKEN}}` reads as "not live", which is why the token-scanner never sees
 * these strings in rendered output — they are gated before they reach JSX.
 */
/**
 * How a node is staffed — the operating model, confirmed by the founder
 * 2026-07-31.
 *
 * One node manager and up to four agents at any node. Agents are shopper- and
 * merchant-facing on the floor; the node manager coordinates with mall
 * management so operations run smoothly. That is a **description of the model**,
 * which is what a mall operator is actually evaluating, and it is deliberately
 * more concrete than the "our team" phrasing it replaces — a named structure
 * with a cap and defined roles tells an operator what they are getting, where a
 * vague plural tells them nothing and invites the wrong follow-up question.
 *
 * Stated as how a node runs, never as a headcount standing in BBS Mall today.
 * The distinction matters: the model is true as a design and is what this
 * demonstration site exists to show; a present-tense staffing count would be a
 * measured figure, and measured figures go through `ScenarioStat`.
 */
export const NODE_TEAM = {
  managers: 1,
  agentsMax: 4,
  managerRole:
    "coordinates with mall management so the node runs smoothly, and owns the relationship with the operator",
  // Plural: both call sites read "The agents {agentRole}" (`/about` and
  // `/mall-operators`), which rendered "the agents works the floor" on the two
  // pages investors and mall operators are most likely to read. `managerRole`
  // stays singular because its subject, "the node manager", is.
  agentRole:
    "work the floor with shoppers and merchants — onboarding shops, setting up staff accounts, and helping at the counter",
} as const;

/**
 * Published response commitments, set by founder ruling 2026-07-31.
 *
 * These were held until now: `website-handoff.md` §9 holds every stated response
 * time, and `copy/contact.md` is blunt that "a missed commitment here does more
 * damage than no commitment at all". They are published because they can be met,
 * and they are deliberately conservative — tighten them once there is a month of
 * evidence, never the other way round.
 *
 * Business days, not calendar days, so a Saturday enquiry is not a missed promise.
 */
export const RESPONSE_TIMES = {
  whatsapp: "the same day",
  form: "1 business day",
  operator: "2 business days",
} as const;

export const isOfferLive = (o: { expiresOn: string }) =>
  !o.expiresOn.startsWith("{{") && new Date(o.expiresOn) > new Date();
