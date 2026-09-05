import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";
import { HEADER_CTA, HEADER_WAITLIST, FOOTER_COLUMNS , HEADER_WAITLIST } from "@/lib/marketing/nav";
import { DEMO_MODE } from "@/lib/marketing/demo";

/**
 * Design board 1 (2026-09-05) — the marketing surfaces. Each guard pins a
 * founder ruling or a board rule that a later tidy-up would most plausibly undo.
 */
const SRC = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => stripComments(readFileSync(path.join(SRC, ...p), "utf8"));
const HOME = read("app", "(marketing)", "page.tsx");
const SHOPPERS = read("app", "(marketing)", "shoppers", "page.tsx");
const MERCHANTS = read("app", "(marketing)", "merchants", "page.tsx");
const ACQ = read("components", "marketing", "acquisition.tsx");

describe("the header carries the pre-launch action", () => {
  // Founder ruling 2026-09-05, amending D259: pre-launch the bar's one amber
  // element is the waitlist, because /feed is demo deals and robots-disallowed.
  // Founder direction 2026-09-05 (Nairobi pilot repositioning, superseding the
  // board-1 ruling): pre-launch the primary action is "Explore demo deals",
  // into the real feed — which carries its own disclosure before any deal can
  // be touched and labels every card "Demo". The waitlist keeps a secondary
  // entry beside sign-in.
  it("points at the demo feed while DEMO_MODE holds, and at the live feed after", () => {
    expect(HEADER_CTA.href).toBe("/feed");
    if (DEMO_MODE) {
      expect(HEADER_CTA.label).toBe("Explore demo deals");
      expect(HEADER_WAITLIST.href).toBe("/waitlist");
      const product = FOOTER_COLUMNS.find((c) => c.title === "Product")!;
      // Named as what it is, never as a live feed.
      expect(product.links.find((l) => l.href === "/feed")?.label).toBe("Explore demo deals");
    } else {
      expect(HEADER_CTA.label).toBe("Browse deals");
    }
  });
});

describe("one action per page, repeated — never two competing ones", () => {
  // Every amber fill on the three pages is the waitlist / register action.
  // A second amber destination on a page is the drift this catches.
  it("spends amber only on the page's own action", () => {
    for (const [name, src, href] of [
      ["home", HOME, "/waitlist"],
      ["shoppers", SHOPPERS, "/waitlist?role=shopper"],
      ["merchants", MERCHANTS, "/merchants/join"],
    ] as const) {
      const amber = src.split("\n").filter((l) => /bg-brand/.test(l));
      expect(amber.length, `${name}: expected one amber fill in the page source`).toBe(1);
      // The page names its one destination once, as a literal (directly or as
      // the single const every CTA on the page reads).
      expect(src, `${name}: the amber goes to ${href}`).toContain(`"${href}"`);
    }
    expect(ACQ, "acquisition components spend no amber fill").not.toMatch(/bg-brand/);
  });
});

describe("nothing invented, nothing counted", () => {
  it("quotes no signup count, rating, testimonial or partner on the three pages", () => {
    for (const src of [HOME, SHOPPERS, MERCHANTS]) {
      expect(src).not.toMatch(/\b\d[\d,]*\+?\s+(shops|shoppers|merchants|users|members)\s+(have|are|already)/i);
      expect(src).not.toMatch(/testimonial|★|stars? out of|rated|trusted by|partnered with/i);
    }
  });

  it("draws the example code and the example deal from the shared sample list, disclosed", () => {
    expect(ACQ).toContain("SAMPLE_CODE");
    expect(ACQ).toContain("SAMPLE_DEALS[0]");
    expect(ACQ).toContain("Example — not a real offer");
    expect(ACQ).toContain("An invented example code");
  });

  it("states that the staffing numbers are a model, not a headcount", () => {
    expect(ACQ).toContain("It is not a count of people standing in");
    expect(ACQ).toContain("NODE_TEAM.agentsMax");
  });

  // The honest status block is a list of things that have not happened. It
  // must switch off with DEMO_MODE, never be edited into a half-true version.
  it("gates the status block on the pre-launch flag", () => {
    expect(HOME).toContain("SHOW_PRELAUNCH_STATUS_BLOCK ?");
  });
});

describe("the retired surfaces stay retired", () => {
  it("has removed the feed mockup, both walkthrough rails and the inline early-access form", () => {
    for (const rel of [
      ["components", "marketing", "HeroShot.tsx"],
      ["components", "marketing", "ShopperWalkthrough.tsx"],
      ["components", "marketing", "MerchantWalkthrough.tsx"],
      ["app", "(marketing)", "landing-early-access.tsx"],
    ]) {
      expect(existsSync(path.join(SRC, ...rel)), `${rel.join("/")} was retired by board 1`).toBe(false);
    }
    expect(HOME).not.toMatch(/HeroShot|LandingEarlyAccess/);
    expect(SHOPPERS).not.toMatch(/ShopperWalkthrough/);
    expect(MERCHANTS).not.toMatch(/MerchantWalkthrough/);
  });

  it("keeps how-it-works inside /shoppers as a deep link", () => {
    expect(SHOPPERS).toContain('id="how-it-works"');
    expect(HOME).toContain("/shoppers#how-it-works");
  });

  it("shows the sticky bar only after the hero, and only on the shopper page", () => {
    expect(SHOPPERS).toContain('sentinelId="hero-end"');
    expect(HOME).not.toContain("StickyWaitlistBar");
    expect(MERCHANTS).not.toContain("StickyWaitlistBar");
    const bar = read("components", "marketing", "StickyWaitlistBar.tsx");
    expect(bar).toContain("IntersectionObserver");
    expect(bar).toContain("lg:hidden");
  });
});
