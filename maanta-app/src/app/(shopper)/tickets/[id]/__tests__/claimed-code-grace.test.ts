import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ClaimedCode } from "../claimed-code";
import { DEAL_GRACE_MINUTES, getDealExpiryState } from "@/lib/deal-expiry";

/**
 * R-GRACE — a claimed code is valid until the deal expires, **plus a 15-minute
 * grace period**. Never a fixed countdown from the moment of claim.
 *
 * Two things are being pinned:
 *
 *  1. The grace period is a state the shopper can SEE. Before this, once a deal
 *     ended the hero showed a shrinking mm:ss with the label "until this code
 *     expires" and nothing said the deal was over — a shopper at the counter had
 *     no way to know whether the code was still honourable, and neither did the
 *     cashier reading over their shoulder.
 *  2. The state is carried by a WORD, not by the number alone (L12). A smaller
 *     number is not a state change.
 */
const CODE = "482913";

/** ISO string `mins` minutes from now (negative = in the past). */
function inMinutes(mins: number) {
  return new Date(Date.now() + mins * 60_000).toISOString();
}

function render(props: { expiresAt: string; dealEndsAt?: string | null }) {
  return renderToStaticMarkup(createElement(ClaimedCode, { code: CODE, ...props }));
}

describe("claimed code — grace period (R-GRACE)", () => {
  it("counts down to the code's own expiry while the deal is live", () => {
    const html = render({ expiresAt: inMinutes(45), dealEndsAt: inMinutes(30) });
    expect(html).toContain("until this code expires");
    expect(html).not.toContain("grace period");
  });

  it("names the grace period once the deal has ended but the code has not", () => {
    // Deal over 5 minutes ago; code still live for another 10.
    const html = render({ expiresAt: inMinutes(10), dealEndsAt: inMinutes(-5) });
    expect(html).toContain("grace period");
    expect(html).toContain(`${DEAL_GRACE_MINUTES} minutes after the deal ends`);
    expect(html).toContain("still valid");
  });

  it("says expired only once the code itself has expired", () => {
    const html = render({ expiresAt: inMinutes(-1), dealEndsAt: inMinutes(-20) });
    expect(html).toContain("this code has expired");
    expect(html).toContain("0:00");
    expect(html).not.toContain("grace period");
  });

  it("falls back to the plain countdown for a legacy claim with no deal expiry", () => {
    // `deals.expires_at` is nullable, so a legacy ticket may not know when its
    // deal ended. Guessing a grace state would be worse than not showing one.
    const html = render({ expiresAt: inMinutes(20), dealEndsAt: null });
    expect(html).toContain("until this code expires");
    expect(html).not.toContain("grace period");
  });

  it("still carries the state in a word, not only in the number", () => {
    // Greyscale-readable: strip every digit and the state must survive.
    const grace = render({ expiresAt: inMinutes(10), dealEndsAt: inMinutes(-5) }).replace(/\d/g, "");
    expect(grace).toContain("grace period");
  });
});

describe("grace window matches the shared expiry model", () => {
  it("agrees with getDealExpiryState on the three bands", () => {
    // The hero must not invent its own idea of the window — 15 minutes lives in
    // lib/deal-expiry and the RPC, and this is the UI reading the same rule.
    expect(getDealExpiryState(inMinutes(30)).status).toBe("live");
    expect(getDealExpiryState(inMinutes(-5)).status).toBe("in_grace");
    expect(getDealExpiryState(inMinutes(-(DEAL_GRACE_MINUTES + 1))).status).toBe("expired");
  });
});
