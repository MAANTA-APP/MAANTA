import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Founder ruling R3 — shopper feed ordering and disclosure (2026-09-02).
 * Closes drift **D223**, **D224**, **D225** and **D226**.
 *
 * ## What went wrong
 *
 * The feed has three rails and three different ordering rules
 * (`deal-list-controls.ts`, pinned by `locked-feed-order.test.ts`). The
 * marketing site described them as if there were one, and got the one it chose
 * backwards:
 *
 *  - `/shoppers` told shoppers that *Neighbourhood favourites* was "deals other
 *    shoppers have actually redeemed" — that is rail 3's order. Rail 2 is
 *    ordered by most recent **paid** boost: KES 500 per 24h, Elite-only
 *    (`20260715194145_boost_elite_only_gate.sql`).
 *  - `/` headed a whole section "Ranked by who actually walked in" and stated
 *    unqualified that a deal rises on verified redemptions — true of rail 3
 *    only, and used as the argument that position cannot be bought, directly
 *    above the rail that is sold.
 *
 * So the site told merchants the placement was bought and told shoppers it was
 * earned. That is the failure this file exists to prevent, and it is a claims
 * defect of the same family as D87 and D90 rather than a wording preference.
 *
 * ## What is guarded, and what deliberately is not
 *
 * Guarded: the unqualified ranking claim cannot return; a shopper-facing
 * description of the boosted rail must disclose that the placement is paid;
 * the impossible flash window cannot return; and `/deals/[id]` must keep the
 * disclosure sentence on a boosted deal.
 *
 * NOT guarded here: the rail **names** (R2, `rail-names.test.ts`) and the rail
 * **orders** (D1, `locked-feed-order.test.ts`). R3 changes neither, and every
 * correction it authorises is a description beside a rail. If a future ruling
 * renames the rail — "Featured near you" was raised as the longer-term option
 * — this guard still holds, because it asserts the presence of disclosure
 * rather than one exact sentence.
 *
 * Comments are stripped first (shared D38 lexer), so explaining any of this in
 * a comment stays legal. Only copy a build could ship trips these tests.
 */

const SRC = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => stripComments(readFileSync(path.join(SRC, ...p), "utf8"));

const HOME = () => read("app", "(marketing)", "page.tsx");
const SHOPPERS = () => read("app", "(marketing)", "shoppers", "page.tsx");
const FEED = () => read("app", "(shopper)", "feed", "page.tsx");
const DEAL_DETAIL = () => read("app", "(shopper)", "deals", "[id]", "page.tsx");

/** Whitespace-collapsed, because JSX wraps prose at arbitrary points (D90's lesson). */
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("R3 — the ranking claim is qualified to the rail it is true of", () => {
  it("does not head a section with the unqualified site-wide claim", () => {
    for (const [name, src] of [["/", HOME()], ["/shoppers", SHOPPERS()]] as const) {
      expect(
        /(^|>)\s*Ranked by who actually walked in/.test(flat(src)),
        `${name} states the ranking claim unqualified. Verified redemptions order\n` +
          "rail 3 only — rail 1 is expiry-ordered and rail 2 is paid. Name the rail."
      ).toBe(false);
    }
  });

  it("names the rail wherever it says a deal rises on verified redemptions", () => {
    for (const [name, src] of [["/", HOME()], ["/shoppers", SHOPPERS()]] as const) {
      const text = flat(src);
      const makesClaim = /a deal (rises|moves up) because/i.test(text);
      if (!makesClaim) continue;
      expect(
        /Deals near me/.test(text),
        `${name} says a deal rises on verified redemptions without naming the rail\n` +
          "that is true of. An unqualified claim is D224."
      ).toBe(true);
    }
  });

  it("never denies that placement can be bought", () => {
    // The reviewed variant "deals rise ... not because they bought ads" would
    // turn an over-broad claim into a false denial. A boost IS bought placement.
    for (const [name, src] of [["/", HOME()], ["/shoppers", SHOPPERS()]] as const) {
      expect(
        /not because they (bought|paid for) ads|no one can (buy|pay for) placement|placement cannot be bought/i.test(
          flat(src)
        ),
        `${name} denies that placement can be bought. Boosts are sold at KES 500 per 24h.`
      ).toBe(false);
    }
  });
});

describe("R3 — the boosted rail is disclosed as paid wherever it is described to a shopper", () => {
  const DISCLOSES = /promoted by local shops|paid to (feature|put)|pays to (feature|put)/i;

  it("discloses on the marketing pages that describe the rail", () => {
    for (const [name, src] of [["/", HOME()], ["/shoppers", SHOPPERS()]] as const) {
      const text = flat(src);
      if (!/Boosted|Neighbourhood favourites/.test(text)) continue;
      expect(
        DISCLOSES.test(text),
        `${name} names the boosted rail to shoppers without disclosing that the\n` +
          "placement is paid for. That is D223 — the merchant pages state it plainly\n" +
          "(/merchants, /pricing, /about, /faq); the shopper pages must not imply it\n" +
          "was earned."
      ).toBe(true);
    }
  });

  it("keeps the in-app rail subtitle disclosing", () => {
    const text = flat(FEED());
    expect(
      /Neighbourhood favourites/.test(text),
      "rail title is frozen by R2 — see rail-names.test.ts"
    ).toBe(true);
    expect(
      DISCLOSES.test(text),
      "the feed names Neighbourhood favourites with no paid-placement disclosure in\n" +
        "its subtitle. The rail title carries an implied popularity claim (R2 froze\n" +
        "the name, not the subtitle), so the subtitle is where R3 puts the fact."
    ).toBe(true);
  });

  it("keeps the boost disclosure on the deal detail page", () => {
    const text = flat(DEAL_DETAIL());
    expect(
      /boost_active \? \(/.test(text) || /boost_active/.test(text),
      "the detail page no longer branches on boost_active"
    ).toBe(true);
    expect(
      /This shop paid to feature this deal for \{BOOST_WINDOW_HOURS\} hours/.test(text),
      "the R3 disclosure sentence is gone from /deals/[id]. The BOOSTED chip alone\n" +
        "names the mechanism, not the commercial fact — a chip reads as an editorial\n" +
        "badge."
    ).toBe(true);
    expect(
      /\{BOOST_WINDOW_HOURS\}/.test(text),
      "the disclosure types the window instead of reading BOOST_WINDOW_HOURS. The\n" +
        "window is owned by purchase_boost; a disclosure that disagrees with the\n" +
        "window it discloses is worse than none."
    ).toBe(true);
  });
});

describe("R3 — the flash window is not advertised below what the product can create", () => {
  it("does not promise flash deals under an hour", () => {
    // FlashSlider is min={1} max={24} (src/components/ui/inputs.tsx), so a flash
    // deal shorter than an hour cannot be created. "often" additionally asserted
    // an observed frequency across a history that does not exist.
    for (const [name, src] of [["/", HOME()], ["/shoppers", SHOPPERS()]] as const) {
      expect(
        /under an hour/i.test(flat(src)),
        `${name} advertises flash windows "under an hour". The flash duration\n` +
          "slider's minimum is 1 hour and its default is 6 — D225."
      ).toBe(false);
    }
  });

  it("keeps the slider minimum this copy depends on", () => {
    const inputs = readFileSync(path.join(SRC, "components", "ui", "inputs.tsx"), "utf8");
    expect(
      /min=\{1\}/.test(inputs) && /max=\{24\}/.test(inputs),
      "the flash slider range moved. The marketing copy says 'as short as an hour';\n" +
        "if the minimum changed, the copy is now wrong in the other direction."
    ).toBe(true);
  });
});

describe("R3 — the home page does not describe a sort the feed does not use", () => {
  it("does not tell visitors the feed is sorted by nearest", () => {
    // DEFAULT_FEED_SORT is "featured" (the locked three-rail structure);
    // "nearest" is DEFAULT_BROWSE_SORT. D226.
    expect(
      /Deals sorted by what is nearest/i.test(flat(HOME())),
      "the home page describes Browse's default sort as the feed's."
    ).toBe(false);
  });
});
