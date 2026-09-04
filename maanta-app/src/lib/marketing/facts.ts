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
 * The planned M-Pesa top-up mechanism — STK push via IntaSend
 * (`initiateMpesaStkPush` in `@/lib/intasend`). There is no paybill path.
 *
 * **Planned, not available.** No payment of any kind exists inside MAANTA
 * today, and no public surface may describe one as working — see
 * `PAYMENT_AVAILABILITY` below (founder ruling 2026-09-04, `10 §2 X3/X4`).
 */
export const TOPUP_METHOD = "stk-push" as const;

/**
 * Whether a merchant can pay MAANTA inside the product — the single source for
 * every sentence about top-ups, wallets and settlement (`10 §3`,
 * `paymentAvailability`).
 *
 * `inAppPaymentLive` is `false` because it is false: IntaSend and Stripe are
 * integrated in code but no rail is switched on, and the FAQ told merchants
 * to expect an M-Pesa prompt and that "card also works". The copy here is
 * deliberately neutral on how the pilot settles the fee (GD1 is unruled) — it
 * commits only to *when* that conversation happens, before the first confirmed
 * code. Flip the flag on the day a rail is live; do not edit the sentences on
 * the pages, which all read from here.
 */
export const PAYMENT_AVAILABILITY = {
  inAppPaymentLive: false,
  /** The paragraph shown wherever the merchant payment model is explained. */
  note: "Paying MAANTA. There is no payment inside MAANTA today. In-app top-up by M-Pesa is planned and is not available yet. During the pilot we agree settlement with you directly before your first confirmed code.",
  /** `/faq` Q11 — "How do I top up my balance?" */
  faqAnswer: `You cannot yet. There is no payment of any kind inside MAANTA today — no M-Pesa top-up and no card payment. It is planned, and we will tell you before it becomes available. During the pilot, how the KES ${SUCCESS_FEE_KES} is settled is agreed with you directly, in person, before your first confirmed code.`,
} as const;

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
 * Stated as how a node is designed to run, never as a headcount standing in BBS
 * Mall today. The distinction matters: the model is true as a design and is what
 * this demonstration site exists to show; a present-tense staffing count would
 * be a measured figure, and measured figures go through `ScenarioStat`. The
 * sentence the pages render is `NODE_STAFFING_MODEL` in `live-claims.ts`, which
 * composes these values and — while `DEMO_MODE` holds — says outright that no
 * node is staffed today (founder ruling 2026-09-04, `10 §2 X2`).
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

/*
 * There is deliberately NO `RESPONSE_TIMES` here any more.
 *
 * It held "the same day" (WhatsApp), "1 business day" (form and email) and
 * "2 business days" (operators), published by founder ruling 2026-07-31 on the
 * argument that they could be met. Founder ruling 2026-09-04 (`10 §2 X9`)
 * withdrew them: no support team exists, so no response time may be published.
 * `SUPPORT_REPLY_LINE` in `live-claims.ts` is what `/help` and `/contact` say
 * instead. Publish a turnaround again only once someone owns meeting it, and
 * do it there, once.
 */

export const isOfferLive = (o: { expiresOn: string }) =>
  !o.expiresOn.startsWith("{{") && new Date(o.expiresOn) > new Date();
