import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CounterQr } from "@/components/merchant/counter-qr";
import {
  RecentVerifications,
  type RecentVerification,
} from "@/components/merchant/recent-verifications";
import { stripComments } from "@/lib/__tests__/helpers/comment-stripping";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const src = (p: string) => stripComments(read(p));

/* ------------------------------------------------------------------ */
/* G3/G4 — the rendered and printable QR                               */
/* ------------------------------------------------------------------ */

describe("the counter QR renders the merchant's own check-in URL", () => {
  const url = "https://www.maanta.app/qr/0123456789abcdef0123456789abcdef";
  const html = renderToStaticMarkup(createElement(CounterQr, { url }));

  it("draws a real SVG, not a placeholder or an <img>", () => {
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
  });

  it("encodes something — a QR with no modules would print as an empty box", () => {
    const paths = html.match(/<path/g) ?? [];
    expect(paths.length).toBeGreaterThan(0);
  });

  it("is labelled for screen readers", () => {
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="[^"]*check-in QR/i);
  });

  it("renders differently for a different token — it is not a static image", () => {
    const other = renderToStaticMarkup(
      createElement(CounterQr, {
        url: "https://www.maanta.app/qr/ffffffffffffffffffffffffffffffff",
      })
    );
    expect(other).not.toBe(html);
  });

  it("never fetches the code from a third party", () => {
    const componentSource = src("src/components/merchant/counter-qr.tsx");
    expect(componentSource).not.toMatch(/https?:\/\//);
    expect(componentSource).not.toMatch(/fetch\(|api\.qrserver|chart\.googleapis|quickchart/i);
  });
});

describe("the printable sheet", () => {
  const page = read("src/app/merchant/(app)/qr/print/page.tsx");
  const stripped = stripComments(page);

  it("is owner-gated server-side and redirects a staff seat away", () => {
    expect(stripped).toMatch(/if \(!isOwner\) redirect\(/);
  });

  it("carries the MAANTA name and the founder-approved instructions", () => {
    expect(stripped).toContain("MAANTA");
    expect(stripped).toContain("Scan when you arrive");
    expect(stripped).toContain("Open MAANTA and scan this code to check in.");
    expect(stripped).toContain("Staff will verify your deal separately.");
  });

  it("promises no points or rewards on a sticker that cannot be updated", () => {
    expect(stripped).not.toMatch(/point|reward|fast visit|earn|bonus/i);
  });

  it("prints no token, merchant id or other sensitive text", () => {
    // The QR's ENCODED VALUE is the only machine-readable thing on the sheet.
    // `${token}` inside the URL template is exactly that and is fine; what
    // must never appear is the token rendered as visible text, i.e. a bare
    // `{token}` JSX expression (no leading `$`).
    expect(stripped).not.toMatch(/(?<!\$)\{token\}/);
    expect(stripped).not.toMatch(/(?<!\$)\{merchant\.id\}/);
    // The URL may only travel as the QR's prop, never as a text node.
    const urlUses = stripped.match(/\{url\}/g) ?? [];
    const urlAsProp = stripped.match(/url=\{url\}/g) ?? [];
    expect(urlUses.length).toBe(urlAsProp.length);
    // The dashboard's old mono link treatment must not reappear here.
    expect(stripped).not.toMatch(/font-mono/);
  });

  it("hides app chrome from the printed page", () => {
    expect(stripped).toContain("print:hidden");
  });

  it("degrades honestly when the shop has no token yet", () => {
    expect(stripped).toMatch(/no check-in code yet/i);
    expect(stripped).toMatch(/6-digit code/);
  });
});

describe("the merchant shell never reaches the printed sheet", () => {
  // The print route lives under merchant/(app)/layout.tsx, so without print
  // rules the sheet carries the top bar — including the WALLET BALANCE — the
  // banners and the fixed bottom nav onto a wall-mounted page (Codex P2).
  const layout = stripComments(read("src/app/merchant/(app)/layout.tsx"));

  it("hides the top bar, banners and bottom nav from print", () => {
    expect(layout).toMatch(/print:hidden[\s\S]{0,400}MerchantTopBar/);
    expect(layout).toMatch(/print:hidden[\s\S]{0,200}MerchantBottomBar/);
  });

  it("drops the shell frame and nav padding on paper", () => {
    expect(layout).toContain("print:border-0");
    expect(layout).toContain("print:pb-0");
  });

  it("changes nothing on screen — every rule is print-scoped", () => {
    const added = (layout.match(/print:[a-z0-9-]+/g) ?? []);
    expect(added.length).toBeGreaterThan(0);
    // No non-print utility was swapped out while adding them.
    expect(layout).toContain("min-h-dvh");
    expect(layout).toContain("pb-24");
  });
});

describe("the dashboard QR card", () => {
  const dash = stripComments(read("src/app/merchant/(app)/dashboard/page.tsx"));

  it("renders the code instead of printing the raw link as text", () => {
    expect(dash).toContain("CounterQr");
    expect(dash).not.toMatch(/break-all font-mono[^>]*>\s*\{counterLink\}/);
  });

  it("offers the print sheet", () => {
    expect(dash).toContain("/merchant/qr/print");
  });

  it("stays owner-only", () => {
    expect(dash).toMatch(/if \(isOwner\)/);
  });
});

/* ------------------------------------------------------------------ */
/* G1 — recent verifications                                           */
/* ------------------------------------------------------------------ */

const ITEM: RecentVerification = {
  id: "r1",
  name: "Amina H.",
  dealTitle: "Summer Abaya",
  verifiedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
};

describe("recent verifications", () => {
  it("shows name, deal and relative time", () => {
    const html = renderToStaticMarkup(
      createElement(RecentVerifications, { items: [ITEM] })
    );
    expect(html).toContain("Amina H.");
    expect(html).toContain("Summer Abaya");
    expect(html).toMatch(/ago/);
  });

  it("keeps the age truthful on a till left open (Codex P2)", () => {
    // Server-rendered text would freeze at whatever it said when the page
    // last rendered; a stale "just now" is exactly the lie that makes staff
    // re-verify a used code. The label must come from the ticking client
    // component, not a one-shot server call.
    const componentSource = src("src/components/merchant/recent-verifications.tsx");
    expect(componentSource).toContain("LiveAgo");
    expect(componentSource).not.toMatch(/relativeAgo\(/);
    const live = src("src/components/merchant/live-ago.tsx");
    expect(live).toContain('"use client"');
    expect(live).toMatch(/setInterval/);
  });

  it("renders nothing when there is genuinely nothing to show", () => {
    const html = renderToStaticMarkup(
      createElement(RecentVerifications, { items: [] })
    );
    expect(html).toBe("");
  });

  it("a failed read is NOT an empty list (D164/D185)", () => {
    const html = renderToStaticMarkup(
      createElement(RecentVerifications, { items: [], readFailed: true })
    );
    expect(html).not.toBe("");
    expect(html).toMatch(/Couldn&#x27;t load|Couldn't load/);
    expect(html).toContain('role="status"');
  });

  it("shows no money — the fee is not counter copy", () => {
    const html = renderToStaticMarkup(
      createElement(RecentVerifications, { items: [ITEM] })
    );
    expect(html).not.toMatch(/KES|\bfee\b/i);
  });

  it("offers no action — it can never become a second verification path", () => {
    const html = renderToStaticMarkup(
      createElement(RecentVerifications, { items: [ITEM] })
    );
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
  });

  it("carries no expanded PII", () => {
    const componentSource = src("src/components/merchant/recent-verifications.tsx");
    expect(componentSource).not.toMatch(/\bphone\b|\bemail\b|full_name/);
  });
});

describe("the redeem page's recent-verifications read", () => {
  const page = stripComments(read("src/app/merchant/(app)/redeem/page.tsx"));

  it("scopes to the authenticated merchant — the tenant boundary", () => {
    expect(page).toMatch(/\.eq\("merchant_id", merchant\.id\)/);
  });

  it("reads only successful redemptions", () => {
    expect(page).toMatch(/\.eq\("status", "success"\)/);
  });

  it("minimises identity through the shared helper", () => {
    expect(page).toContain("staffFacingName");
  });

  it("passes a read failure through instead of flattening it to empty", () => {
    expect(page).toMatch(/recentFailed/);
    expect(page).toMatch(/readFailed=\{recentFailed\}/);
  });

  it("shows the strip only to seats that can verify", () => {
    expect(page).toMatch(/permissions\.can_verify \? \(\s*<RecentVerifications/);
  });
});

/* ------------------------------------------------------------------ */
/* G2 + G6 — queue badge and states                                    */
/* ------------------------------------------------------------------ */

describe("the queue panel", () => {
  const panel = stripComments(read("src/app/merchant/(app)/redeem/queue-panel.tsx"));

  it("renders Fast Visit as icon + word, not colour alone", () => {
    expect(panel).toContain("IconBolt");
    expect(panel).toMatch(/Fast Visit/);
    // The old inline-text form must not come back.
    expect(panel).not.toContain('" · Fast Visit"');
  });

  it("shows the badge only from the server's persisted verdict", () => {
    expect(panel).toMatch(/e\.fastVisitEligible \?/);
    // Nothing client-side may recompute eligibility from timestamps.
    expect(panel).not.toMatch(/15|claimedAt|FAST_VISIT_WINDOW/);
  });

  it("has four distinct states: failed, loading, empty, populated", () => {
    expect(panel).toMatch(/entries === null && loadFailed/);   // failed first load
    expect(panel).toMatch(/if \(entries === null\)/);           // loading
    expect(panel).toMatch(/entries\.length === 0\) return null/); // empty
    expect(panel).toContain("Shopper queue");                    // populated
  });

  it("says something while loading rather than looking empty", () => {
    expect(panel).toMatch(/Checking for waiting shoppers/);
  });

  it("keeps the failed-read line distinct from the loading line", () => {
    expect(panel).toMatch(/Couldn&apos;t load the shopper queue/);
  });

  it("still hands a tapped code over in memory, never by URL", () => {
    expect(panel).toContain("publishQueueCode");
    expect(panel).not.toMatch(/router\.(push|replace)/);
    expect(panel).not.toMatch(/\?code=/);
  });

  it("truncates long shopper and deal names rather than breaking the row", () => {
    expect(panel).toMatch(/truncate/);
    expect(panel).toContain("min-w-0");
  });
});

/* ------------------------------------------------------------------ */
/* Security invariants — the QR must never become a money path         */
/* ------------------------------------------------------------------ */

describe("the QR remains arrival evidence only", () => {
  const checkIn = stripComments(read("src/app/api/qr/check-in/route.ts"));

  it("records an arrival and nothing else", () => {
    expect(checkIn).toContain("record_shopper_arrival");
  });

  it("never verifies a redemption", () => {
    expect(checkIn).not.toContain("verify_redemption");
  });

  it("never awards points", () => {
    expect(checkIn).not.toContain("award_fast_visit_points");
  });

  it("derives the shopper from the session, never from the request body", () => {
    expect(checkIn).not.toMatch(/body\.(userId|user_id|shopperId)/);
  });
});
