import { DEMO_MODE } from "./demo";
import { FACTS, NODE_TEAM } from "./facts";

/**
 * Every sentence on the marketing site that says MAANTA is trading.
 *
 * ## Why they are all in one file
 *
 * Founder ruling 2026-08-10, closing drift **D87**: drop "Live at" everywhere
 * while the company is pre-launch. The claim was in twenty-one places across
 * nine files — four hero status lines, the footer of every page, two CTA
 * labels, a hero badge, five prose sentences, four metadata strings and an OG
 * image subline — and the reason it spread is that each one was written as a
 * literal at the point of use. `og.tsx` had already gated its own copy, which
 * is how the site ended up with a carefully hedged OG status line and an
 * ungated "Live at BBS Mall" in the footer directly beneath it.
 *
 * So the fix is not a find-and-replace, it is an address: every trading claim
 * resolves here, gated on `DEMO_MODE`, and flipping that one flag at launch
 * restores all of them in a single commit. That is the same rule
 * `demo-mode-spec.md` §5 already applies to `LegalDraftBanner`,
 * `PrelaunchNotice` and `PlaceholderId` — this file puts the positive claims
 * under the same switch as the disclosures that contradict them.
 *
 * ## What is deliberately *not* here
 *
 * "Live" is also ordinary product vocabulary: a **deal** is live, a filter chip
 * on `/shoppers` is called "Live now", and a mall "goes live" when it becomes a
 * node. None of that asserts MAANTA is trading today, and none of it belongs
 * here. The claim this file governs is specifically *MAANTA is operating at a
 * named mall right now*.
 */

/** The launch node's location, stated without any claim about trading. */
export const NODE_LOCATION = `${FACTS.launchMall} · ${FACTS.city}`;

/**
 * The one-sentence description of MAANTA — drift **D138**.
 *
 * Two surfaces render it, and both reach a reader *before* any page and its
 * `PrelaunchNotice` can: the root metadata description, which is the
 * search-result snippet, and the **web app manifest description**, which is what
 * the Android install prompt and the app listing show at the moment someone
 * installs. That is the same argument D46 made for the OG image and D87 made for
 * the root description, one surface further out.
 *
 * It lived as a `DEMO_MODE` ternary inside `src/app/layout.tsx` and as a frozen
 * post-launch string inside `public/manifest.webmanifest` — a static JSON file
 * that cannot read a flag, which is very likely why the manifest kept saying
 * "Now live at BBS Mall, Eastleigh" for as long as it did. Both now resolve
 * here, which is the address this file exists to be.
 */
export const SITE_DESCRIPTION = DEMO_MODE
  ? `Discover, claim and redeem live mall deals. Launching at ${FACTS.launchMall}.`
  : `Discover, claim and redeem live mall deals. Now live at ${FACTS.launchMall}.`;

/**
 * The status line under every audience hero and in the site footer.
 *
 * Pre-launch this is the location alone. The `LiveDot` that used to sit beside
 * it is suppressed by the same flag — see `SHOW_LIVE_INDICATOR` — because an
 * amber status dot next to a bare place name carries the same claim in colour,
 * and frozen UI rule 4 requires state to be an icon *and* a word, readable in
 * greyscale. Removing the words and keeping the dot would have moved the claim
 * rather than dropped it.
 */
export const NODE_STATUS_LINE = DEMO_MODE ? NODE_LOCATION : `Live at ${NODE_LOCATION}`;

/** Whether a live-status indicator may render at all. */
export const SHOW_LIVE_INDICATOR = !DEMO_MODE;

/** The badge at the top of `/malls/bbs-mall`. */
export const NODE_BADGE = DEMO_MODE ? FACTS.nodeLabel.toUpperCase() : "LIVE NOW";

/** The status line in the body of `/malls/bbs-mall`. */
export const NODE_CITY_LINE = DEMO_MODE
  ? `${FACTS.nodeLabel} · ${FACTS.city}`
  : `Live now · ${FACTS.city}`;

/**
 * Opens the "Where it works" sentence on `/` and `/shoppers`, and the
 * "Where we are today" sentence on `/about`.
 *
 * "opens first at" is future tense and survives launch as a true statement
 * about order, but it stops being the most useful thing to say once trading
 * starts, so it still flips.
 */
export const NODE_PRESENCE_LEAD = DEMO_MODE ? "MAANTA opens first at" : "MAANTA is live at";

/** `/about` and `/mall-operators`, in the non-scenario branch. */
export const NODE_ONLY_MALL_SENTENCE = DEMO_MODE
  ? `MAANTA opens first at ${FACTS.launchMall} — our first mall, and the only one so far.`
  : `MAANTA is live at ${FACTS.launchMall} — our first mall, and the only one so far.`;

/** `/mall-operators`, non-scenario branch. */
export const NODE_FIRST_NODE_LEAD = DEMO_MODE
  ? `MAANTA opens first at ${FACTS.launchMall} — our first node.`
  : `MAANTA is live at ${FACTS.launchMall} — our first node.`;

/**
 * The scenario branches on `/about` and `/mall-operators`.
 *
 * These render only when `NEXT_PUBLIC_SCENARIO_MODE` is set, which production
 * does not set, and everything inside them is already disclosed as modelled by
 * `ScenarioNotice`. They are gated anyway: "modelled" explains that a number is
 * illustrative, not that the company is trading, and no combination of flags
 * should be able to produce the claim while `DEMO_MODE` holds.
 */
export const NODE_DURATION_LEAD = DEMO_MODE
  ? `MAANTA has been at ${FACTS.launchMall} for`
  : `MAANTA has been live at ${FACTS.launchMall} for`;

/** The link into `/malls/bbs-mall` from `/` and `/shoppers`. */
export const SEE_NODE_LINK_LABEL = DEMO_MODE
  ? "Inside BBS Mall"
  : "See what's live at BBS Mall";

/**
 * The subline on `/about`'s OG image.
 *
 * This is the surface `og.tsx` argues hardest about in its own docblock — an
 * unfurled card travels without the footer that would qualify it — and it was
 * the one place that bypassed `OG_STATUS_LINE` by hardcoding the claim.
 */
export const NODE_OG_SUBLINE = DEMO_MODE
  ? `${FACTS.launchMall}, ${FACTS.city}.`
  : `Live at ${FACTS.launchMall}, ${FACTS.city}.`;

/** The closing CTA band on `/shoppers`. */
export const NODE_CTA_TITLE = DEMO_MODE
  ? "See what your mall is offering."
  : "See what is live in your mall right now.";

/* ------------------------------------------------------------------ *
 * D90 — present-tense operating claims.
 *
 * Founder ruling 2026-08-10: MAANTA is demo / pre-launch and is **not**
 * currently operating a public deal, claim or redemption programme at BBS
 * Mall. D87 removed the twenty-one claims that used the word "live"; these are
 * the ones that said the same thing without it, and they are the reason the
 * D87 guard passing did not mean the site had stopped claiming to trade.
 *
 * The pre-launch wording describes **how the product works** and **what is
 * being prepared**, which is true today, rather than what is happening at a
 * named mall right now, which is not. No pilot date, approval, partnership or
 * performance figure is asserted in either state — none of those exists to
 * assert, and inventing one is the failure `held-claims.test.ts` exists to
 * prevent.
 * ------------------------------------------------------------------ */

/** `/malls/bbs-mall` — the opening paragraph. */
export const NODE_PAGE_INTRO = DEMO_MODE
  ? `MAANTA is built to be run on the floor: shops publish deals from a phone, shoppers claim them on theirs, and staff verify every redemption at the counter. ${FACTS.launchMall} is the first mall we are preparing to open in.`
  : `${FACTS.launchMall} is where MAANTA started and where the product is run in person. Shops here publish deals from a phone, shoppers claim them on theirs, and every redemption is verified at the counter.`;

/**
 * `/malls/bbs-mall` — the line above the feed link.
 *
 * Pre-launch this has to say what the feed actually contains, because the
 * demo-data banner is correctly scoped off marketing routes (risk R1) and the
 * visitor meets it only after tapping through. Sending someone to a feed of
 * synthetic deals while calling it "the live answer" is the claim this row is
 * about, in its most direct form.
 */
export const NODE_FEED_NOTE = DEMO_MODE
  ? "The feed shows demo deals while we prepare to open. They illustrate the shopper experience — they are not offers you can redeem today."
  : "What is on offer changes through the day. The feed is the live answer.";

/** `/malls/bbs-mall` — meta description. */
export const NODE_PAGE_DESCRIPTION = DEMO_MODE
  ? `${FACTS.launchMall} is ${FACTS.nodeLabel} — the first mall MAANTA is preparing to open in. See how a shopper claims a deal on a phone and redeems it at the counter.`
  : `${FACTS.launchMall} is ${FACTS.nodeLabel} — the first mall MAANTA opens in. See what its shops are offering, claim a deal on your phone, and redeem it at the counter.`;

/** `/shoppers` — hero subheading. */
export const SHOPPER_HERO_SUB = DEMO_MODE
  ? `Open the feed to see how it works: tap a deal, get a ${FACTS.codeLength}-digit code, and show it at the counter. You pay the deal price in person, the way you normally pay. The deals shown are demo examples while we prepare to open.`
  : `Open the feed and see what the shops in your mall are offering right now. Tap a deal, get a ${FACTS.codeLength}-digit code, and show it at the counter. You pay the deal price in person, the way you normally pay.`;

/** `/` — the shopper card in the three-door router. */
export const SHOPPER_DOOR_BODY = DEMO_MODE
  ? "See how MAANTA works for shoppers. Free, no card, and nothing to download."
  : "See what the shops in your mall are offering right now. Free, no card, and nothing to download.";

/** `/shoppers` — the "Where it works" sentence, after `NODE_PRESENCE_LEAD`. */
export const NODE_SHOPS_SENTENCE = DEMO_MODE
  ? "That is our first mall, and its shops will be the first publishing deals."
  : "That is our first mall, and the shops there are the ones publishing deals today.";

/** `/pricing` — closing CTA band title. */
export const MERCHANT_CTA_TITLE = DEMO_MODE
  ? "Get your shop ready for launch."
  : "Publish your first deal today.";

/**
 * The "how long before we see anything meaningful?" answer, on `/faq` and
 * `/mall-operators`.
 *
 * "The first redemption **usually happens** within a day of a shop going live"
 * asserts observed operating history across enough malls for a norm to exist.
 * There is none — the pilot has not run. The pre-launch wording states the
 * design (a shop can publish immediately) without claiming a track record.
 */
/**
 * "A month of data is enough…" — founder ruling 2026-09-04 (`10 §2 X2`).
 *
 * Stated as an expectation, and one that has not been tested, because no mall
 * has run a month on MAANTA. Shared by `/faq`, `/mall-operators` (via the two
 * answers below) so it flips in one place.
 */
export const MONTH_OF_DATA_SENTENCE = DEMO_MODE
  ? "We expect a month of data to be enough to see patterns by floor and by hour. That expectation has not been tested — no mall has run a month on MAANTA."
  : "A month of data is enough to see patterns by floor and by hour.";

export const FIRST_RESULTS_ANSWER = DEMO_MODE
  ? `A shop can publish on the day it joins, so its first redemption can follow the same day. ${MONTH_OF_DATA_SENTENCE}`
  : `The first redemption usually happens within a day of a shop going live. ${MONTH_OF_DATA_SENTENCE}`;

/**
 * The `/mall-operators` version of the same answer, which carries one extra
 * sentence about a quarter's data.
 *
 * Kept as a second constant rather than folded into the one above: the two
 * answers are deliberately different lengths for different readers, and
 * flattening them to share a string would quietly rewrite operator-facing copy
 * as a side effect of a claims fix.
 */
export const FIRST_RESULTS_ANSWER_OPERATOR = `${FIRST_RESULTS_ANSWER} A quarter is enough to see whether tenant behaviour has changed.`;

/**
 * `/mall-operators` — the Node 0 paragraph, non-scenario branch.
 *
 * This one was invisible to a `grep` and to the guard alike, because JSX
 * wrapped it as "…is being run in\n person". It surfaced only in the built
 * HTML, and it is why the guard now matches whitespace-collapsed whole files
 * rather than single lines.
 */
export const NODE_REFERENCE_SENTENCE = DEMO_MODE
  ? `${FACTS.nodeLabel} is our first node and the reference for how a node is deployed: tenants onboarded unit by unit, staff trained at their own counters, and every redemption verified at the till.`
  : `${FACTS.nodeLabel} is our first node and where the product is being run in person: tenants onboarded unit by unit, staff trained at their own counters, and every redemption verified at the till. It is the reference for how a node is deployed and operated.`;

/* ------------------------------------------------------------------ *
 * D261 — premises. Founder ruling 2026-09-04 (`10 §2 X1`).
 *
 * MAANTA has no desk, office or address in BBS Mall, and will not until the
 * mall authorises the relationship. Until 2026-09-04 the footer of every page,
 * `/contact` and the contact section of all three legal documents published
 * "BBS Mall, Eastleigh, Nairobi, Kenya" as MAANTA's address, and `/contact`
 * described "the desk at BBS Mall" as a way to reach us. A landlord reading
 * that a company claims premises on its floor before that company has
 * introduced itself is a first impression that cannot be un-made, so the
 * address block and every desk claim came out ahead of the first approach.
 *
 * The permitted phrasing is intent — "preparing to open at BBS Mall" — which
 * matches `/malls/bbs-mall` and claims nothing about the mall. `ENTITY` no
 * longer carries an `address` field at all, so a surface that wants one fails
 * to type-check rather than quietly reintroducing the claim.
 * ------------------------------------------------------------------ */

/** The footer base bar and the `/about` closing band — name and intent, never a postal address. */
export const ENTITY_LINE = DEMO_MODE
  ? `MAANTA APP · preparing to open at ${FACTS.launchMall}, ${FACTS.city}`
  : `MAANTA APP · ${FACTS.launchMall}, ${FACTS.city}`;

/**
 * `/contact` — the sentence that replaces the desk card. The second sentence is
 * the one that matters and is worded to survive being read by the mall itself.
 */
export const NO_DESK_NOTICE = DEMO_MODE
  ? `MAANTA is preparing to open at ${FACTS.launchMall}, ${FACTS.city}. We do not have a desk or an office in the mall yet. Until we do, email and WhatsApp are the only ways to reach us.`
  : `MAANTA works at ${FACTS.launchMall}, ${FACTS.city}. Email and WhatsApp are the ways to reach us.`;

/* ------------------------------------------------------------------ *
 * Founder ruling 2026-09-04 — public claims (`10 §2` and `§3`).
 *
 * The four claims below repeated across several pages as separate literals,
 * which is why the same defect appeared on three pages at once and why a
 * future edit would have missed one. Each now has exactly one source. When
 * one of them becomes true it is changed here and nowhere else — several of
 * them will change on the same day demo mode is resolved.
 *
 *   operatingStatus   → OPERATING_STATUS_SENTENCE
 *   nodeStaffingModel → NODE_STAFFING_MODEL (composed from NODE_TEAM)
 *   supportContact    → SUPPORT_REPLY_LINE, HELP_DESCRIPTION (no SLA exists)
 *   paymentAvailability lives in `facts.ts` as PAYMENT_AVAILABILITY, because
 *   it does not flip with DEMO_MODE — a payment rail goes live on its own day.
 * ------------------------------------------------------------------ */

/** The one sentence about whether MAANTA is operating. */
export const OPERATING_STATUS_SENTENCE = DEMO_MODE
  ? "MAANTA is not yet operating."
  : `MAANTA is operating at ${FACTS.launchMall}.`;

/**
 * How a node is staffed — `/about`, `/mall-operators`, `/merchants` (X2).
 *
 * Pre-launch it is a design, and says so: no node is staffed today. The cap
 * and the roles still read from `NODE_TEAM`, which is the frozen decision
 * (2026-07-31) this sentence must not restate as prose.
 */
export const NODE_STAFFING_MODEL = DEMO_MODE
  ? `A node is designed to run with one node manager and up to ${NODE_TEAM.agentsMax} agents working the floor — onboarding shops, setting up staff accounts and helping at the counter. ${OPERATING_STATUS_SENTENCE} No node is staffed today. This is the model we are building toward at ${FACTS.launchMall}.`
  : `Each node runs with one node manager and up to ${NODE_TEAM.agentsMax} agents. The agents ${NODE_TEAM.agentRole}. The node manager ${NODE_TEAM.managerRole}.`;

/** `/mall-operators` deployment lead (X2) — a plan, not a track record. */
export const DEPLOYMENT_TIMELINE_LEAD = DEMO_MODE
  ? "Four steps. We expect roughly a month from agreement to a live feed — we have not yet done this with a mall, so treat that as a plan, not a track record."
  : "Four steps, and roughly a month from agreement to live feed.";

/**
 * The support reply line — `/help`, `/contact` (X9).
 *
 * No support team exists, so no response time may be published. The
 * 2026-07-31 `RESPONSE_TIMES` ("the same day", "1 business day") are gone
 * with it; publish a turnaround again only once someone owns meeting it.
 */
export const SUPPORT_REPLY_LINE = DEMO_MODE
  ? "MAANTA is not yet operating — we reply as soon as we can, by WhatsApp or email."
  : "We reply as soon as we can, by WhatsApp or email.";

/** `/help` meta description — the same line, in the snippet Google shows. */
export const HELP_DESCRIPTION = `How to claim and redeem a MAANTA deal, what the grace period is, and how to reach us. ${SUPPORT_REPLY_LINE}`;

/**
 * The feed CTA on `/` and `/shoppers` (X10).
 *
 * The feed holds demo deals and no real ones while demo mode is on, so
 * "live" is unsupportable on the primary shopper conversion path. Gated on
 * `DEMO_MODE` rather than left to a comment: it reverts on the day the demo
 * data is resolved, and not before.
 */
export const FEED_CTA_LABEL = DEMO_MODE ? "See the demo feed" : "Browse live deals";
