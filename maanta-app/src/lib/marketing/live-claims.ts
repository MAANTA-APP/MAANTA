import { DEMO_MODE } from "./demo";
import { FACTS } from "./facts";
import { PILOT_EYEBROW, PILOT_STATUS_SENTENCE } from "./pilot-status";

/**
 * Every sentence on the marketing site that says where MAANTA is or whether
 * it is trading.
 *
 * ## Why they are all in one file
 *
 * Founder ruling 2026-08-10, closing drift **D87**: drop "Live at" everywhere
 * while the company is pre-launch. The claim was in twenty-one places across
 * nine files, and the reason it spread is that each one was written as a
 * literal at the point of use. So the fix is an address: every trading claim
 * resolves here, gated on `DEMO_MODE`, and flipping that one flag at launch
 * restores all of them in a single commit.
 *
 * ## The 2026-09-05 repositioning
 *
 * Founder direction: the site markets a **Nairobi pilot whose location is not
 * confirmed**. BBS Mall in Eastleigh is a potential location only. Pre-launch,
 * nothing here may name it as where MAANTA opens, operates, has a desk, has
 * staff, or opens first. The approved sentences live in `pilot-status.ts`;
 * this file's pre-launch branches read them. The post-launch branches are
 * kept as the shape launch will restore, and remain unreachable while
 * `DEMO_MODE` holds.
 *
 * ## What is deliberately *not* here
 *
 * "Live" is also ordinary product vocabulary: a **deal** is live, a filter chip
 * on `/shoppers` is called "Live now", and a mall "goes live" when it becomes a
 * node. None of that asserts MAANTA is trading today, and none of it belongs
 * here.
 */

/** The status line under every audience hero, in the site footer and on every OG image. */
export const NODE_STATUS_LINE = DEMO_MODE ? PILOT_EYEBROW : `Live at ${FACTS.candidateMall} · ${FACTS.city}`;

/** Kept for callers that want the bare place: pre-launch it is the pilot eyebrow. */
export const NODE_LOCATION = NODE_STATUS_LINE;

/**
 * The line under the lockup in the footer. Pre-launch it says outright that
 * nothing on the site is redeemable today.
 */
export const FOOTER_TAGLINE = DEMO_MODE
  ? "MAANTA is built but has not launched commercially. Nothing on this site is an offer you can redeem today."
  : "Live mall deals, claimed on your phone and verified at the counter.";

/** The homepage's honest status block. Pre-launch only. */
export const SHOW_PRELAUNCH_STATUS_BLOCK = DEMO_MODE;

/**
 * The one-sentence description of MAANTA — drift **D138**. Root metadata
 * description and the web app manifest description.
 */
export const SITE_DESCRIPTION = DEMO_MODE
  ? "Explore how MAANTA helps shoppers find time-limited offers and helps Nairobi shops measure verified counter visits. Public pilot location to be confirmed."
  : `Discover, claim and redeem live mall deals. Now live at ${FACTS.candidateMall}.`;

/** The homepage title. */
export const SITE_TITLE = DEMO_MODE ? "MAANTA — Discover deals from Nairobi shops" : "MAANTA — The mall, made live.";

/** Whether a live-status indicator may render at all. */
export const SHOW_LIVE_INDICATOR = !DEMO_MODE;

/** The badge at the top of `/malls/bbs-mall`. */
export const NODE_BADGE = DEMO_MODE ? "POTENTIAL NODE 0 LOCATION" : "LIVE NOW";

/** The status line in the body of `/malls/bbs-mall`. */
export const NODE_CITY_LINE = DEMO_MODE ? PILOT_EYEBROW : `Live now · ${FACTS.city}`;

/**
 * The sentence that says where MAANTA is. Pre-launch it is the approved
 * pilot-status sentence, whole; it never names a mall.
 */
export const NODE_PRESENCE_SENTENCE = DEMO_MODE
  ? PILOT_STATUS_SENTENCE
  : `MAANTA is live at ${FACTS.candidateMall}.`;

/** `/about` and `/mall-operators`, in the non-scenario branch. */
export const NODE_ONLY_MALL_SENTENCE = DEMO_MODE
  ? PILOT_STATUS_SENTENCE
  : `MAANTA is live at ${FACTS.candidateMall} — our first mall, and the only one so far.`;

/** `/mall-operators`, non-scenario branch. */
export const NODE_FIRST_NODE_LEAD = DEMO_MODE
  ? "A first node would be the reference for every later one."
  : `MAANTA is live at ${FACTS.candidateMall} — our first node.`;

/**
 * The scenario branches on `/about` and `/mall-operators`. Render only when
 * `NEXT_PUBLIC_SCENARIO_MODE` is set, which production does not set.
 */
export const NODE_DURATION_LEAD = DEMO_MODE
  ? "In this modelled scenario a node has run for"
  : `MAANTA has been live at ${FACTS.candidateMall} for`;

/** The link into `/malls/bbs-mall` from `/` and `/shoppers`. */
export const SEE_NODE_LINK_LABEL = DEMO_MODE
  ? "About the potential first location"
  : "See what's live at BBS Mall";

/** The subline on `/about`'s OG image. */
export const NODE_OG_SUBLINE = DEMO_MODE
  ? PILOT_STATUS_SENTENCE
  : `Live at ${FACTS.candidateMall}, ${FACTS.city}.`;

/** The closing CTA band on `/shoppers`. */
export const NODE_CTA_TITLE = DEMO_MODE
  ? "Be there when Nairobi's first MAANTA shops switch on."
  : "See what is live in your mall right now.";

/* ------------------------------------------------------------------ *
 * D90 — present-tense operating claims.
 *
 * MAANTA is demo / pre-launch and is **not** operating a public deal, claim
 * or redemption programme anywhere. The pre-launch wording describes how the
 * product works and what is being prepared, never what is happening at a
 * named mall right now. No pilot date, approval, partnership or performance
 * figure is asserted in either state.
 * ------------------------------------------------------------------ */

/** `/malls/bbs-mall` — the opening paragraph. */
export const NODE_PAGE_INTRO = DEMO_MODE
  ? `MAANTA is built to be run on the floor: shops publish deals from a phone, shoppers claim them on theirs, and staff verify every redemption at the counter. ${FACTS.candidateMallProse} is one potential location for the first controlled pilot. No agreement, permission or launch date has been confirmed.`
  : `${FACTS.candidateMall} is where MAANTA started and where the product is run in person. Shops here publish deals from a phone, shoppers claim them on theirs, and every redemption is verified at the counter.`;

/** `/malls/bbs-mall` — the line above the feed link. */
export const NODE_FEED_NOTE = DEMO_MODE
  ? "The feed shows demonstration deals while the pilot is prepared. They illustrate the shopper experience — nothing in it can be claimed or redeemed."
  : "What is on offer changes through the day. The feed is the live answer.";

/** `/malls/bbs-mall` — meta description. */
export const NODE_PAGE_DESCRIPTION = DEMO_MODE
  ? `${FACTS.candidateMallProse} is a potential location for MAANTA's first Nairobi pilot — not a confirmed partner or launch site. See how a shopper would claim a deal on a phone and redeem it at the counter.`
  : `${FACTS.candidateMall} is ${FACTS.nodeLabel} — the first mall MAANTA opens in. See what its shops are offering, claim a deal on your phone, and redeem it at the counter.`;

/** `/` — the shopper card in the three-door router. */
export const SHOPPER_DOOR_BODY = DEMO_MODE
  ? "Explore time-limited offers, claim one from your phone and redeem it directly with the shop."
  : "See what the shops in your mall are offering right now. Free, no card, and nothing to download.";

/** `/pricing` — closing CTA band title. */
export const MERCHANT_CTA_TITLE = DEMO_MODE
  ? "Get your shop ready for the pilot."
  : "Publish your first deal today.";

/**
 * The "how long before we see anything meaningful?" answer, on `/faq` and
 * `/mall-operators`. Pre-launch it states the design without a track record.
 */
export const FIRST_RESULTS_ANSWER = DEMO_MODE
  ? "In a pilot, a shop could publish on the day it joins, so its first redemption could follow the same day. A month of data would be enough to see patterns by floor and by hour."
  : "The first redemption usually happens within a day of a shop going live. A month of data is enough to see patterns by floor and by hour.";

/** The `/mall-operators` version, one extra sentence about a quarter's data. */
export const FIRST_RESULTS_ANSWER_OPERATOR = `${FIRST_RESULTS_ANSWER} A quarter would show whether tenant behaviour has changed.`;

/** `/mall-operators` — the proposed node model, non-scenario branch. */
export const NODE_REFERENCE_SENTENCE = DEMO_MODE
  ? `A first node would be the reference for how a node is deployed: tenants onboarded unit by unit, staff trained at their own counters, and every redemption verified at the till. None of that has started anywhere yet.`
  : `${FACTS.nodeLabel} is our first node and where the product is being run in person: tenants onboarded unit by unit, staff trained at their own counters, and every redemption verified at the till. It is the reference for how a node is deployed and operated.`;
