import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

const read = (rel: string) =>
  stripComments(readFileSync(path.join(__dirname, "../../", rel), "utf8"));

/**
 * The product distinction on the ticket screen, and the two places PR 1 wired
 * the rewards surface in.
 *
 * The semantics were already right when #275 landed — this file proves that
 * rather than restating it, so a later edit cannot quietly reintroduce copy
 * that makes a closed reward window read as an invalid ticket.
 */

describe("the Fast Visit timer reads as a reward window, never as ticket expiry", () => {
  const panel = read("app/(shopper)/tickets/[id]/fast-visit-panel.tsx");

  it("says the claim survives the window closing, in every closed state", () => {
    // The whole product distinction in one line: the reward is optional, the
    // claim is not affected.
    const flat = panel.replace(/\s+/g, " ");
    expect(flat).toContain("Reward window ended");
    expect(flat).toContain("your claim is still valid");
    // Whitespace-tolerant: JSX wraps this line, so an exact-string match
    // would be asserting the formatter's line breaks, not the copy.
    expect(panel.replace(/\s+/g, " ")).toContain("claim stays valid either way");
  });

  it("never calls the reward window expired, late or lost", () => {
    expect(panel).not.toMatch(/too late|expired|you missed|no longer valid/i);
  });

  it("labels the timer as a reward, not as a deadline on the code", () => {
    expect(panel).toContain("Fast Visit reward");
    expect(panel).not.toMatch(/until this code|code expires/i);
  });

  it("keeps the reward countdown visually subordinate to the claim countdown", () => {
    // Both were `font-code font-semibold text-ink`, one size step apart, which
    // is not a hierarchy — it is two near-identical timers on a screen where
    // confusing them means mistaking an optional reward for your code's
    // deadline.
    const code = read("app/(shopper)/tickets/[id]/claimed-code.tsx");
    expect(code).toContain('className="font-code text-xl font-semibold text-ink"');
    expect(panel).toMatch(/font-code mt-1 text-base font-medium text-secondary/);
    expect(panel).not.toMatch(/font-code mt-1 text-lg font-semibold text-ink/);
  });

  it("leaves the claim countdown's own wording untouched", () => {
    const code = read("app/(shopper)/tickets/[id]/claimed-code.tsx");
    expect(code).toContain("until this code expires");
  });
});

describe("rewards entry appears only when something was actually earned", () => {
  const ticket = read("app/(shopper)/tickets/[id]/page.tsx");

  it("gates the link on this redemption's award, not on a null balance", () => {
    // rewardBalance is only computed when a reward row exists, so it is null in
    // the ordinary no-reward case too. Gating on it would have rendered the
    // link for every shopper and un-darkened a switched-off feature.
    expect(ticket).toMatch(/\{rewardPoints != null \? \(/);
    expect(ticket).not.toMatch(/rewardBalance == null \|\|/);
  });

  it("links to the existing rewards surface and nowhere else", () => {
    expect(ticket).toContain('href="/you/rewards"');
  });

  it("makes no cash, transfer or marketplace promise anywhere on the screen", () => {
    expect(ticket).not.toMatch(/cash out|cash-out|withdraw|transfer your points|redeem points for/i);
  });
});

describe("the Fast Visit chip on /my-deals stays flag-aware", () => {
  const myDeals = read("app/(shopper)/my-deals/page.tsx");

  it("resolves the feature flag server-side and passes it to the decision", () => {
    expect(myDeals).toContain("isFastVisitEnabled()");
    expect(myDeals).toContain("fastVisitChipState(");
    expect(myDeals).toContain("featureEnabled: fastVisitOn");
  });

  it("reads the persisted arrival verdict rather than re-deriving it", () => {
    // D191: qualification is decided at arrival and is immutable.
    expect(myDeals).toContain("qualifiedAt: r.fast_visit_qualified_at");
  });

  it("renders nothing when the decision says hidden", () => {
    expect(myDeals).toMatch(/\{fastVisitLabel \? \(/);
    expect(myDeals).toMatch(/\) : null\}/);
  });
});

describe("the Ending soon section is additive and derived from filtered rails", () => {
  const feed = read("app/(shopper)/feed/page.tsx");

  it("selects from allDeals, which is after the shopper's own filters", () => {
    // Deriving from the unfiltered rails would surface a deal the shopper's
    // category or type filter had just removed.
    expect(feed).toMatch(/const allDeals = \[[\s\S]{0,80}\];\s*[\s\S]{0,40}const endingSoon = endingSoonDeals\(allDeals\)/);
  });

  it("renders nothing when nothing is genuinely ending", () => {
    expect(feed).toMatch(/\{endingSoon\.length > 0 \? \(/);
  });

  it("keeps each card's own rail tag rather than relabelling it", () => {
    expect(feed).toContain("tag: dealRailTag(d)");
  });

  it("does not reorder or remove the existing rails", () => {
    // The three locked rails and the favourites rail must all still render on
    // their own terms.
    for (const title of [
      "Top picks near you",
      "Neighbourhood favourites",
      "Deals near me",
      "Your favourites",
    ]) {
      expect(feed).toContain(title);
    }
    // Ending soon sits between the flash rail and the boosted rail; the
    // relative order of the locked rails is unchanged.
    expect(feed.indexOf("Top picks near you")).toBeLessThan(feed.indexOf("Ending soon"));
    expect(feed.indexOf("Ending soon")).toBeLessThan(feed.indexOf("Neighbourhood favourites"));
    expect(feed.indexOf("Neighbourhood favourites")).toBeLessThan(feed.indexOf("Deals near me"));
  });
});
