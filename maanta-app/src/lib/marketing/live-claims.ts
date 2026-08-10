import { DEMO_MODE } from "./demo";
import { FACTS } from "./facts";

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
