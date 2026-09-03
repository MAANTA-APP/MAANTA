import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactElement } from "react";
import { stripComments } from "@/lib/__tests__/helpers/comment-stripping";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/merchants/33333333-3333-4333-8333-333333333331",
  useSearchParams: () => new URLSearchParams(),
}));

// Static imports are safe: `vi.mock` above is hoisted, so `next/navigation` is
// already replaced by the time these modules evaluate. (A dynamic `await
// import()` here would also work at runtime but fails `tsc` — the project's
// module target forbids top-level await.)
import { MerchantAdminActions } from "@/app/admin/merchants/[id]/merchant-admin-actions";
import { MerchantLocationForm } from "@/app/admin/merchants/[id]/merchant-location-form";
import { OverrideButton } from "@/app/admin/support/override-button";
import { PlanActions } from "@/app/admin/billing/plan-actions";

/**
 * Frozen UI rule 1 — "≤1 amber action per screen" — on Merchant 360 (D241).
 *
 * ## Why this test renders instead of scanning source
 *
 * Rule 1 has never had a guard. The audit that froze the rules recorded it as
 * "PASS (manual spot-check) — not statically checkable", and the reason is
 * real: an amber button's presence depends on render-time state (a merchant's
 * status, whether a support task is open, which plan they are on), and on
 * Merchant 360 the ambers are not even in the page file — they arrive inside
 * four child components the page composes.
 *
 * That is exactly how the defect happened. Every one of those controls was
 * compliant on the page it was written for: Save location is the only action
 * on its form, Override is the action on `/admin/support`, Grant trial is the
 * action on `/admin/billing`. Merchant 360 put them on one screen, so the
 * record page showed three ambers at once — four for a pending Standard shop
 * with an open task, since Approve is amber too. A source scan of the page
 * file sees none of them, and a spot-check only catches the state it happens
 * to look at.
 *
 * So the amber count is taken from rendered HTML, over the specific prop
 * combinations Merchant 360 can produce. `bg-brand` is the accent fill and the
 * only way a button becomes amber (`components/ui/button.tsx`), and a disabled
 * button is forced to `!bg-cream-dark` — never amber — by the same file, which
 * is rule L9b and is asserted below rather than assumed.
 *
 * ## What the rule resolves to here
 *
 * One amber, and it is **Approve**, on a pending shop only. That is the
 * decision an admin arrives from the Action Queue to make. Every other control
 * on the page is a correction or an ops lever, so on an active, suspended or
 * rejected shop the page carries **zero** amber — which rule 1 allows and the
 * frozen-rules audit already expects of outcome surfaces.
 *
 * This does not check that amber renders *pleasingly*; it checks the ration.
 * The visual reading was done in a browser at iPhone size (skills doc §11).
 */

const AMBER = /\bbg-brand\b/g;

/** How many amber-filled controls this element renders. */
function amberCount(el: ReactElement): number {
  return (renderToStaticMarkup(el).match(AMBER) ?? []).length;
}

const MERCHANT_ID = "33333333-3333-4333-8333-333333333331";

const adminActions = (status: string) =>
  createElement(MerchantAdminActions, {
    merchantId: MERCHANT_ID,
    merchantName: "Proof Shop One",
    status,
    node: "BBS Mall",
    w3w: "proof.shop.one",
    floorUnit: "1st Floor, B-12",
    isFeatured: false,
    isShadowBanned: false,
    trialCap: { cap: 100, granted: 0, remaining: 100 },
  });

/** Exactly what `admin/merchants/[id]/page.tsx` composes, in one array. */
function merchant360Controls(status: string, opts: { openTask: boolean; tier: "standard" | "elite" }) {
  return [
    adminActions(status),
    createElement(MerchantLocationForm, {
      merchantId: MERCHANT_ID,
      initialW3w: "proof.shop.one",
      initialLat: -1.2746,
      initialLng: 36.8501,
    }),
    ...(opts.openTask
      ? [createElement(OverrideButton, { taskId: "task-1", variant: "ghost" as const })]
      : []),
    createElement(PlanActions, {
      merchantId: MERCHANT_ID,
      tier: opts.tier,
      onTrial: false,
      variant: "ghost" as const,
    }),
  ];
}

const total = (els: ReactElement[]) => els.reduce((n, el) => n + amberCount(el), 0);

describe("Merchant 360 rations the amber accent (frozen rule 1, D241)", () => {
  it("shows exactly one amber on a pending shop, and it is Approve", () => {
    const els = merchant360Controls("pending", { openTask: true, tier: "standard" });
    expect(total(els)).toBe(1);

    // Locate it: the one amber button's label is Approve.
    const html = renderToStaticMarkup(adminActions("pending"));
    const amberButton = html.match(/<button[^>]*bg-brand[^>]*>([^<]*)</);
    expect(amberButton?.[1]?.trim()).toBe("Approve");
  });

  it("shows no amber at all on an active shop — a record page has no primary action", () => {
    // The exact state the browser proof captured with three ambers.
    const els = merchant360Controls("active", { openTask: true, tier: "standard" });
    expect(total(els)).toBe(0);
  });

  for (const status of ["suspended", "rejected", "churned"]) {
    it(`shows no amber on a ${status} shop`, () => {
      expect(total(merchant360Controls(status, { openTask: true, tier: "standard" }))).toBe(0);
    });
  }

  it("stays within the ration for an Elite shop and for a shop with no open task", () => {
    expect(total(merchant360Controls("active", { openTask: false, tier: "elite" }))).toBe(0);
    expect(total(merchant360Controls("pending", { openTask: false, tier: "elite" }))).toBe(1);
  });

  it("counts each composed control individually, so a regression names itself", () => {
    expect(amberCount(createElement(OverrideButton, { taskId: "t", variant: "ghost" })), "Override").toBe(0);
    expect(
      amberCount(createElement(PlanActions, { merchantId: MERCHANT_ID, tier: "standard", onTrial: false, variant: "ghost" })),
      "Grant trial"
    ).toBe(0);
    expect(
      amberCount(
        createElement(MerchantLocationForm, {
          merchantId: MERCHANT_ID,
          initialW3w: "proof.shop.one",
          initialLat: null,
          initialLng: null,
        })
      ),
      "Save location"
    ).toBe(0);
  });
});

describe("the demotion is emphasis only — the amber still exists where it belongs", () => {
  // If a later change made these components incapable of amber, the guard above
  // would pass for the wrong reason, and `/admin/support` and `/admin/billing`
  // would silently lose their primary action.
  it("keeps Override amber on its own page (the default)", () => {
    expect(amberCount(createElement(OverrideButton, { taskId: "t" }))).toBe(1);
  });

  it("keeps Grant trial amber on the billing page (the default)", () => {
    expect(
      amberCount(createElement(PlanActions, { merchantId: MERCHANT_ID, tier: "standard", onTrial: false }))
    ).toBe(1);
  });

  it("still passes no variant on those two pages, so their default is what renders", () => {
    const support = stripComments(
      readFileSync(join(process.cwd(), "src/app/admin/support/page.tsx"), "utf8")
    );
    const billing = stripComments(
      readFileSync(join(process.cwd(), "src/app/admin/billing/page.tsx"), "utf8")
    );
    expect(support).toContain("<OverrideButton taskId={t.id} />");
    expect(billing).not.toMatch(/<PlanActions[^>]*variant=/);
  });
});

describe("Merchant 360 passes the demotion at every call site", () => {
  // The render guard covers today's four controls. This covers the next one:
  // a composed control added to the page without a variant is the way the
  // three ambers come back.
  const page = stripComments(
    readFileSync(join(process.cwd(), "src/app/admin/merchants/[id]/page.tsx"), "utf8")
  );

  it("ghosts the Override button on the merchant record", () => {
    expect(page).toMatch(/<OverrideButton[^>]*variant="ghost"/);
  });

  it("ghosts the plan actions on the merchant record", () => {
    expect(page).toMatch(/<PlanActions[^>]*variant="ghost"/);
  });

  it("renders no amber-by-default Button of its own", () => {
    // A bare <Button> is amber; the page must not add one beside Approve.
    const bare = page.match(/<Button(?![^>]*variant=)[^>]*>/g) ?? [];
    expect(bare, `bare <Button> on Merchant 360 renders amber:\n${bare.join("\n")}`).toEqual([]);
  });
});

describe("a disabled control is never amber (rule L9b), which the count relies on", () => {
  it("renders the location form's busy state without the accent", () => {
    // `disabled` forces !bg-cream-dark in button.tsx. Asserted so the amber
    // count above cannot be fooled by a disabled amber button.
    const html = renderToStaticMarkup(
      createElement(MerchantLocationForm, {
        merchantId: MERCHANT_ID,
        initialW3w: "proof.shop.one",
        initialLat: null,
        initialLng: null,
      })
    );
    expect(html).not.toMatch(AMBER);
  });
});
