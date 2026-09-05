import { SUCCESS_FEE_KES } from "@/lib/pricing";
import { DEAL_GRACE_MINUTES } from "@/lib/deal-expiry";

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
  /*
   * There is deliberately NO `elitePerMonthKes` here.
   *
   * It held `3_500` until the founder ruling of 2026-08-24, which removed the
   * Elite subscription price from every public and merchant-facing surface:
   * MAANTA is in Node 0 field validation and will not anchor merchants or the
   * public to a monthly figure before there is genuine merchant evidence about
   * the value MAANTA creates. Elite itself is unchanged and its benefits are
   * still shown; only the price is withheld, as "Pricing coming soon".
   *
   * Do not reintroduce a numeric Elite subscription price here or anywhere in
   * `src/app`, `src/components` or `src/content/legal` without a new
   * decisions-log entry superseding that ruling. `pricing-copy.test.ts` fails if
   * one appears.
   *
   * This does NOT apply to the KES 30 success fee, which remains an active
   * commercial commitment and must stay explicit wherever a merchant needs to
   * know what a verified redemption costs.
   */
  /** Canonical value lives in `app_config.boost_fee_kes` (migration 20260709175532). */
  boostPer24hKes: 500,
  boostHours: 24,
  codeLength: 6,
  /**
   * Re-exported, never redeclared — `DEAL_GRACE_MINUTES` is what the expiry
   * logic actually computes with, so a literal here would be a second copy that
   * a grace change would silently leave behind. Same rule as `successFeeKes`.
   */
  graceMinutes: DEAL_GRACE_MINUTES,
  standardActiveDeals: 1,
  eliteActiveDeals: 2,
  /**
   * The one location under assessment for the first pilot. A **candidate**,
   * never a launch site: no agreement, permission or date exists (founder
   * direction 2026-09-05). Any sentence that names it must carry that
   * qualification — `pilot-status.ts` holds the approved sentences.
   */
  candidateMall: "BBS Mall, Eastleigh",
  /** The same place as it reads inside a sentence. */
  candidateMallProse: "BBS Mall in Eastleigh",
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
 * `@/lib/intasend`). There is no paybill path. **Not operational**: no public
 * page may describe M-Pesa or card top-up as available (founder direction
 * 2026-09-05); this constant describes the design for internal copy only.
 */
export const TOPUP_METHOD = "stk-push" as const;

/**
 * The planned pilot opening offer.
 *
 * Founder-approved commercial model, marked as **planned**: it applies to
 * eligible shops joining the first confirmed Nairobi pilot, and final
 * eligibility and dates are confirmed before onboarding. It is not currently
 * redeemable or contractually available.
 *
 * The fixed 31 October 2026 deadline that used to gate these blocks was
 * removed on 2026-09-05: a date on an offer for a pilot with no confirmed
 * location was a promise about a calendar nobody controls. Reintroduce a date
 * only with a founder ruling, as a real future date, and the render gate
 * `isOfferShown` will need a matching rule.
 */
export const OFFERS = {
  openingCredit: {
    amountKes: 300,
    cohortShops: 100,
    status: "planned",
  },
  eliteTrial: {
    days: 30,
    postTrialGraceDays: 7,
    cohortShops: 100,
    status: "planned",
  },
} as const;

/** How the offer is framed wherever it renders. */
export const OFFER_EYEBROW = "Planned pilot opening offer";
export const OFFER_HEADING = "For eligible shops joining the first confirmed Nairobi pilot.";
export const OFFER_CONFIRMATION_LINE = "Final eligibility and dates will be confirmed before onboarding";

/**
 * Whether an offer block renders at all. A planned offer is shown, framed as
 * planned; anything else is withheld rather than rendered stale.
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
 * Stated as how a node **would** run, never as a headcount standing in any
 * mall today. Every rendering of it must use proposed or conditional language
 * (founder direction 2026-09-05): nobody is deployed anywhere.
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

export const isOfferShown = (o: { status: string }) => o.status === "planned";
