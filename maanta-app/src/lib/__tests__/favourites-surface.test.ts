import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The favourites surface is the My deals Shops tab — frame 8ab. Frame 16a
 * (a separate /you/favourites page) is superseded: founder ruling 2026-08-09,
 * drift D79, recorded in the decisions log.
 *
 * D79's close condition demanded this guard: the shipped tab had no test
 * pinning it, which is part of how the 2026-08-09 design-sync brief came to
 * claim "Favourites API has no page" about a page that existed. Three things
 * are pinned, each a half of the ruling:
 *
 *  - the tab keeps existing and keeps its shape (saved shops from
 *    `merchant_favourites`, an unfollow control, links into the shop page);
 *  - shop rows rank by the verified-redemptions count — the frozen "ranking
 *    is verified redemptions" rule — not 16a's live-deal count;
 *  - no second favourites list appears at /you/favourites. One surface, one
 *    truth: building 16a anyway needs a new ruling, not a quiet route.
 */

const SRC = path.resolve(__dirname, "..", "..");
const read = (...segments: string[]) =>
  readFileSync(path.join(SRC, ...segments), "utf8");

const myDeals = read("app", "(shopper)", "my-deals", "page.tsx");
const you = read("app", "(shopper)", "you", "page.tsx");

describe("favourites surface is the My deals Shops tab (8ab; closes D79)", () => {
  it("offers the Shops tab and lists saved shops from merchant_favourites", () => {
    expect(myDeals).toContain("/my-deals?tab=shops");
    expect(myDeals).toContain('.from("merchant_favourites")');
  });

  it("gives every saved shop an unfollow control and a link to the shop page", () => {
    expect(myDeals).toContain("FavouriteButton");
    expect(myDeals).toContain("/shops/${");
  });

  it("ranks shop rows by verified redemptions, not a live-deal count", () => {
    expect(myDeals).toContain("getVerifiedCounts");
    expect(myDeals).toContain("verifiedCount");
  });

  it("keeps the ruled empty state", () => {
    expect(myDeals).toContain("No saved shops yet");
  });

  it("keeps the /you pointer into the tab", () => {
    expect(you).toContain('title="Your favourites"');
    expect(you).toContain("/my-deals?tab=shops");
  });

  it("has no second favourites list at /you/favourites — 16a is superseded", () => {
    expect(
      existsSync(path.join(SRC, "app", "(shopper)", "you", "favourites")),
      "frame 16a (/you/favourites) was superseded by founder ruling 2026-08-09 (D79) — " +
        "a second list of saved shops is drift by construction; reintroducing it needs a new ruling"
    ).toBe(false);
  });
});
