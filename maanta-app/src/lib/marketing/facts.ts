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
 * Both `expiresOn` values are unfilled tokens pending a founder decision, so
 * **neither offer renders today**. That is deliberate: an opening credit with no
 * end date is an unbounded promise. Filling in the two dates is the only change
 * needed to make them appear. Tracked in the implementation report under
 * "Not implemented".
 */
export const OFFERS = {
  openingCredit: {
    amountKes: 300,
    cohortShops: 100,
    expiresOn: "{{SET_A_DATE}}",
  },
  eliteTrial: {
    days: 30,
    postTrialGraceDays: 7,
    cohortShops: 100,
    expiresOn: "{{SET_A_DATE}}",
  },
} as const;

/**
 * An offer is live only when its expiry is a real future date. An unfilled
 * `{{TOKEN}}` reads as "not live", which is why the token-scanner never sees
 * these strings in rendered output — they are gated before they reach JSX.
 */
export const isOfferLive = (o: { expiresOn: string }) =>
  !o.expiresOn.startsWith("{{") && new Date(o.expiresOn) > new Date();
