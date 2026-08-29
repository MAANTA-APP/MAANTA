import { describe, it, expect } from "vitest";
// The ticket timers seed from the server instant and throw without the
// provider, so these harnesses mount the same one a shopper route does.
import { renderShopperTree } from "@/lib/__tests__/helpers/shopper-clock";
import { createElement } from "react";
import { ClaimedCode } from "@/app/(shopper)/tickets/[id]/claimed-code";

// D167 item 3. The claimed-code hero used to format its countdown as raw
// minutes, so a day-long claim window rendered as "1449:12" — unreadable, and
// disagreeing with the "Expires in 23h 54m" the same ticket showed on
// /my-deals. These renders pin the humanised bands on the real component.
//
// SSR render only (node environment): the 1-second tick lives in useEffect and
// never runs here, so each render shows the initial value computed from the
// expiry the server row supplied — which is exactly the string a shopper sees
// first.

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

function render(expiresInMs: number) {
  return renderShopperTree(
    createElement(ClaimedCode, {
      code: "136456",
      expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    })
  );
}

describe("ClaimedCode countdown bands", () => {
  it("renders a day-long window with day/hour units, never raw minutes", () => {
    // 24h 9m — the shape that produced "1449:12" in production (2026-08-23).
    const html = render(24 * HOUR + 9 * MIN + 30 * SEC);
    expect(html).toContain("1d 0h 9m");
    expect(html).not.toMatch(/\d{3,}:\d{2}/);
  });

  it("renders an hours-long window as h/m/s", () => {
    const html = render(23 * HOUR + 54 * MIN + 30 * SEC);
    expect(html).toContain("23h 54m");
    expect(html).not.toMatch(/\d{3,}:\d{2}/);
  });

  it("keeps the familiar M:SS shape under an hour", () => {
    const html = render(41 * MIN + 30 * SEC);
    expect(html).toMatch(/>41:\d{2}</);
  });

  it("still shows the code and the validity label", () => {
    const html = render(2 * HOUR);
    expect(html).toContain("136 456");
    expect(html).toContain("For the shop");
    expect(html).toContain("until this code expires");
  });

  it("shows the expired state as 0:00", () => {
    const html = render(-5 * MIN);
    expect(html).toContain("0:00");
    expect(html).toContain("this code has expired");
  });
});
