import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

// `useRouter` too: both shells now render the shared sign-out button (D258),
// whose Supabase branch reads the router at render time.
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ push() {}, refresh() {} }),
}));

import { LIVE_PRODUCT_LINKS } from "../live-product-links";
import { FounderHeader } from "../founder-header";
import { AdminSidebar } from "../admin-sidebar";
import { canAccessAdminConsole, canAccessFounderDashboard } from "@/lib/roles";

/**
 * Guards for the admin/founder "go look at the live product" navigation.
 *
 * Two things are pinned, and they are the two that would break silently:
 *
 *  - **The destinations resolve for the roles that can see the link.** A nav item
 *    that redirects is worse than no nav item. `/` is public and `/feed` has no
 *    role guard, so both hold today; if a guard is ever added to the shopper
 *    layout, the source assertion below is the thing that should be revisited.
 *  - **The founder header does not assume founder implies admin.** `cofounder`
 *    reaches the founder dashboard and not the admin console, by design.
 */
const NAV_DIR = path.resolve(__dirname, "..");
const sidebar = readFileSync(path.join(NAV_DIR, "admin-sidebar.tsx"), "utf8");
const shopperLayout = readFileSync(
  path.resolve(NAV_DIR, "..", "..", "app", "(shopper)", "layout.tsx"),
  "utf8"
);

describe("live product links", () => {
  it("points at the landing page and the shopper feed, and nowhere else", () => {
    expect(LIVE_PRODUCT_LINKS.map((l) => l.href)).toEqual(["/", "/feed"]);
    for (const l of LIVE_PRODUCT_LINKS) {
      expect(l.label.length, "every link needs a word, not just an icon").toBeGreaterThan(2);
    }
  });

  it("is one list, shared by both shells", () => {
    // A second hardcoded href in either shell is how the two consoles start
    // disagreeing about where the live product is.
    expect(sidebar).toContain("LIVE_PRODUCT_LINKS");
    expect(sidebar).not.toMatch(/href="\/feed"/);
  });

  it("keeps the shopper feed reachable for console roles", () => {
    // The premise the links depend on: no role guard on the shopper shell.
    expect(shopperLayout).not.toContain("requireCustomer");
    expect(shopperLayout).not.toContain("redirect(");
  });

  it("opens in a new tab, and says so for screen readers", () => {
    // Losing your place in a queue to glance at the feed is the failure this avoids.
    expect(sidebar).toContain('target="_blank"');
    expect(sidebar).toContain('rel="noopener noreferrer"');
    expect(sidebar).toContain("NEW_TAB_HINT");
  });

  it("stays quiet — navigation is never the amber action", () => {
    const html = renderToStaticMarkup(
      createElement(FounderHeader, { canOpenAdminConsole: true })
    );
    expect(html).not.toContain("text-brand");
    expect(html).not.toContain("bg-brand");
  });
});

describe("admin sidebar — what leaves the console sits below the rule", () => {
  const itemsStart = sidebar.indexOf("const ITEMS = [");
  const itemsBlock = sidebar.slice(itemsStart, sidebar.indexOf("];", itemsStart));
  const dividerAt = sidebar.indexOf("border-t border-white/15");
  const founderAt = sidebar.indexOf('href="/founder"');
  const liveLabelAt = sidebar.indexOf("Live product");

  it("keeps ITEMS to routes that stay inside the admin shell", () => {
    // /founder used to sit between Reports and Agents, styled identically to
    // eleven routes that never leave the console. It reads as a section of the
    // console, which it is not — it is a different shell with its own layout.
    expect(itemsBlock).not.toContain("/founder");
    for (const href of itemsBlock.match(/href: "([^"]+)"/g) ?? []) {
      expect(href, "every console item is under /admin").toContain('"/admin');
    }
  });

  it("still offers the founder dashboard, below the rule and above Live product", () => {
    expect(founderAt).toBeGreaterThan(-1);
    expect(dividerAt).toBeGreaterThan(-1);
    expect(founderAt, "below the rule that marks 'leaving the console'").toBeGreaterThan(
      dividerAt
    );
    expect(founderAt, "not filed under the live-product heading").toBeLessThan(liveLabelAt);
  });

  it("switches shells in place, unlike the live-product glance links", () => {
    const founderLink = sidebar.slice(founderAt, liveLabelAt);
    expect(founderLink).not.toContain('target="_blank"');
  });

  it("claims no active state it could never show", () => {
    // /founder renders FounderHeader in its own layout, so this sidebar is never
    // mounted on a /founder path and an isActive branch for it is unreachable.
    const founderLink = sidebar.slice(founderAt, liveLabelAt);
    expect(founderLink).not.toContain("isActive");
    const founderLayout = readFileSync(
      path.resolve(NAV_DIR, "..", "..", "app", "founder", "layout.tsx"),
      "utf8"
    );
    expect(founderLayout).not.toContain("AdminSidebar");
  });

  it("renders in that order, not merely in that source order", () => {
    // The assertions above read source text, so they would still pass if the
    // founder link were moved into a wrapper rendered somewhere else. This one
    // reads the markup the operator actually gets.
    const html = renderToStaticMarkup(createElement(AdminSidebar));
    const hrefs = (html.match(/href="[^"]+"/g) ?? []).map((h) => h.slice(6, -1));

    const founder = hrefs.indexOf("/founder");
    const lastConsoleItem = hrefs.reduce(
      (last, h, i) => (h.startsWith("/admin") ? i : last),
      -1
    );
    const firstLiveProduct = hrefs.indexOf(LIVE_PRODUCT_LINKS[0].href);

    expect(founder).toBeGreaterThan(-1);
    expect(founder, "after every console section").toBeGreaterThan(lastConsoleItem);
    expect(founder, "before the live-product links").toBeLessThan(firstLiveProduct);
  });

  it("is reachable by every role that can see the sidebar", () => {
    // The sidebar only ever renders inside the admin shell.
    expect(canAccessAdminConsole("admin")).toBe(true);
    expect(canAccessFounderDashboard("admin")).toBe(true);
  });
});

describe("FounderHeader admin link", () => {
  it("renders for an admin", () => {
    const html = renderToStaticMarkup(
      createElement(FounderHeader, { canOpenAdminConsole: true })
    );
    expect(html).toContain('href="/admin"');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/feed"');
  });

  it("is withheld from a co-founder, who cannot open the admin console", () => {
    // Not a hypothetical: canAccessFounderDashboard admits cofounder, and
    // canAccessAdminConsole is admin alone — deliberately narrower.
    expect(canAccessFounderDashboard("cofounder")).toBe(true);
    expect(canAccessAdminConsole("cofounder")).toBe(false);

    const html = renderToStaticMarkup(
      createElement(FounderHeader, { canOpenAdminConsole: false })
    );
    expect(html).not.toContain('href="/admin"');
    // The live-product links still render — those are reachable by both roles.
    expect(html).toContain('href="/feed"');
  });

  it("is decided by the guard's own role read in the shell", () => {
    const layout = readFileSync(
      path.resolve(NAV_DIR, "..", "..", "app", "founder", "layout.tsx"),
      "utf8"
    );
    expect(layout).toContain("canAccessAdminConsole(user.role)");
    expect(layout).toContain("FounderHeader");
  });
});
