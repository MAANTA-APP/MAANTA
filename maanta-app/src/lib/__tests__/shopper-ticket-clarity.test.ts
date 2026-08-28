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
  // D213 criterion 1 moved the chip's decision from the server page into a
  // client component so it decays on an open page. The invariants below are
  // unchanged; only where they live moved, so the guard follows them across
  // BOTH files rather than asserting the old server-side shape.
  const myDeals = read("app/(shopper)/my-deals/page.tsx");
  const chips = read("components/shopper/ticket-row-chips.tsx");

  it("resolves the feature flag server-side and passes it to the decision", () => {
    // The flag is a server read (app_config) and must stay one — a client
    // component cannot be trusted to gate a dark feature.
    expect(myDeals).toContain("isFastVisitEnabled()");
    expect(myDeals).toContain("featureEnabled={fastVisitOn}");
    expect(chips).toContain("fastVisitChipState(");
    expect(chips).toContain("featureEnabled,");
  });

  it("reads the persisted arrival verdict rather than re-deriving it", () => {
    // D191: qualification is decided at arrival and is immutable. The clock
    // may close an open window; it may never mint eligibility.
    expect(myDeals).toContain("qualifiedAt={r.fast_visit_qualified_at}");
    expect(chips).toContain("qualifiedAt,");
    expect(chips).not.toMatch(/qualifiedAt\s*[:=][^,;]*now/);
  });

  it("renders nothing when the decision says hidden", () => {
    expect(chips).toMatch(/\{fastVisitLabel \? \(/);
    expect(chips).toMatch(/\) : null\}/);
  });
});

describe("the Ending soon section is additive and derived from filtered rails", () => {
  // D213 criteria 2 and 3 moved membership onto the client clock. Same
  // invariants, new home — the guard reads both files.
  const feed = read("app/(shopper)/feed/page.tsx");
  const rail = read("components/shopper/ending-soon-rail.tsx");

  it("selects from allDeals, which is after the shopper's own filters", () => {
    // Deriving from the unfiltered rails would surface a deal the shopper's
    // category or type filter had just removed.
    expect(feed).toMatch(/items=\{allDeals\.map\(/);
    expect(rail).toContain("endingSoonDeals(");
  });

  it("renders nothing when nothing is genuinely ending", () => {
    expect(rail).toMatch(/selected\.length === 0[\s\S]*return null/);
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
    // relative order of the locked rails is unchanged. The section's TITLE now
    // lives in the client component, so position is asserted on the element
    // the feed renders rather than on the heading text.
    expect(rail).toContain('title="Ending soon"');
    expect(feed.indexOf("Top picks near you")).toBeLessThan(feed.indexOf("<EndingSoonRail"));
    expect(feed.indexOf("<EndingSoonRail")).toBeLessThan(feed.indexOf("Neighbourhood favourites"));
    expect(feed.indexOf("Neighbourhood favourites")).toBeLessThan(feed.indexOf("Deals near me"));
  });
});
