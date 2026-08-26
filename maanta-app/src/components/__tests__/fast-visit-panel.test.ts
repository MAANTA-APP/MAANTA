import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { FastVisitPanel } from "@/app/(shopper)/tickets/[id]/fast-visit-panel";

// The Fast Visit panel's four states, rendered for real. The wording rules
// are product rules (founder brief 2026-08-26 §9): the reward window ending
// must NEVER read as the claim expiring, and a late arrival must never read
// as failure — the claim is untouched either way.

const MIN = 60_000;

// qualifiedAt is the persisted arrival-time verdict
// (redemptions.fast_visit_qualified_at) — the panel never re-derives it
// from timestamps, because timestamps cannot know whether the feature was
// on when the shopper walked in.
function render(
  claimedAt: string | null,
  arrivedAt: string | null,
  qualifiedAt: string | null = null
) {
  return renderToStaticMarkup(
    createElement(FastVisitPanel, { claimedAt, arrivedAt, qualifiedAt })
  );
}

describe("FastVisitPanel states", () => {
  it("counts down the reward window for a fresh, unarrived claim", () => {
    const html = render(new Date(Date.now() - 30_000).toISOString(), null);
    expect(html).toContain("Fast Visit reward");
    expect(html).toMatch(/>14:[0-3]\d</); // ~14:30 left of 15:00
    expect(html).toContain("Scan the MAANTA QR");
    expect(html).toContain("Your claim stays valid either way");
  });

  it("ends the window calmly — never with expiry language", () => {
    const html = render(new Date(Date.now() - 20 * MIN).toISOString(), null);
    expect(html).toContain("Reward window ended");
    expect(html).toContain("your claim is still valid");
    // §9: the window ending is not the claim ending. None of these words.
    expect(html).not.toMatch(/expired/i);
    expect(html).not.toMatch(/too late/i);
    expect(html).not.toMatch(/redemption unavailable/i);
  });

  it("confirms a QUALIFIED arrival with the time it took, points still pending", () => {
    const claimed = new Date(Date.now() - 20 * MIN).toISOString();
    const arrived = new Date(Date.now() - 20 * MIN + 8 * MIN + 17_000).toISOString();
    const html = render(claimed, arrived, arrived);
    expect(html).toContain("You made it");
    expect(html).toContain("Arrived in 8m 17s");
    expect(html).toContain("Fast Visit reward eligible");
    expect(html).toContain("Points pending");
    expect(html).toContain("have staff verify your claim");
  });

  it("renders NOTHING for a late arrival — normal claim experience, no shaming", () => {
    const claimed = new Date(Date.now() - 60 * MIN).toISOString();
    const arrived = new Date(Date.now() - 30 * MIN).toISOString();
    expect(render(claimed, arrived, null)).toBe("");
  });

  it("renders NOTHING for an in-window arrival that did NOT qualify (feature was off at arrival)", () => {
    // The retroactivity rule: the timestamps alone look qualifying, but the
    // persisted verdict is NULL because fast_visit_enabled was false when
    // the shopper scanned. The panel must trust the verdict, not the clock —
    // saying "reward eligible" here would promise points the award RPC will
    // correctly refuse.
    const claimed = new Date(Date.now() - 20 * MIN).toISOString();
    const arrived = new Date(Date.now() - 12 * MIN).toISOString();
    expect(render(claimed, arrived, null)).toBe("");
  });

  it("renders NOTHING for a historical claim with no recorded claim time", () => {
    expect(render(null, null)).toBe("");
  });

  it("keeps the reward timer visually smaller than the claim code", () => {
    // The code renders at text-[30px]; the reward timer must stay below it.
    const html = render(new Date().toISOString(), null);
    expect(html).toContain("text-lg");
    expect(html).not.toContain("text-[30px]");
  });

  it("never uses amber — the reward is not an action and not a credential", () => {
    const claimed = new Date().toISOString();
    for (const html of [
      render(claimed, null),
      render(new Date(Date.now() - 20 * MIN).toISOString(), null),
      render(
        new Date(Date.now() - 20 * MIN).toISOString(),
        new Date(Date.now() - 15 * MIN).toISOString(),
        new Date(Date.now() - 15 * MIN).toISOString()
      ),
    ]) {
      expect(html).not.toContain("text-brand");
      expect(html).not.toContain("bg-brand");
      expect(html).not.toContain("border-brand");
    }
  });
});
