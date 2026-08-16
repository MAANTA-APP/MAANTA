import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

import { OperationsLinks } from "../operations-links";
import { canAccessAdminConsole, canAccessFounderDashboard } from "@/lib/roles";

/**
 * The founder dashboard's Operations block used to link four `/admin/*` cards
 * unconditionally, while the dashboard itself admits a role that cannot open the
 * admin console. For a co-founder each card was one click from
 * `requireAdminPage`'s `redirect("/")` — offered work they are not allowed to
 * open, and thrown off the product for trying.
 *
 * These pin the fix in both directions: the admin keeps the links, the co-founder
 * keeps the information without them. Asserting only the co-founder case would
 * pass just as well if the links vanished for everyone.
 */
const render = (canOpenAdminConsole: boolean) =>
  renderToStaticMarkup(
    createElement(OperationsLinks, { canOpenAdminConsole, pendingMerchants: 3 })
  );

describe("founder Operations block", () => {
  it("links into the console for an admin", () => {
    const html = render(true);
    // Note /admin/approvals, not /admin: the console's front door is the
    // overview dashboard, and this card names the approvals queue.
    for (const href of [
      "/admin/support",
      "/admin/approvals",
      "/admin/reports",
      "/admin/redemptions",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("offers a co-founder no link into a console that would refuse them", () => {
    expect(canAccessFounderDashboard("cofounder")).toBe(true);
    expect(canAccessAdminConsole("cofounder")).toBe(false);

    const html = render(false);
    expect(html).not.toContain("href=");
    expect(html).not.toContain("<a");
  });

  it("keeps the queues and their counts visible either way", () => {
    // Information is the co-founder's job; the action is what they lack. Hiding
    // the block entirely would remove read-only context the role exists for.
    for (const html of [render(true), render(false)]) {
      expect(html).toContain("Support queue");
      expect(html).toContain("Merchant approvals");
      expect(html).toContain("3 shops waiting");
      expect(html).toContain("Platform reports");
      expect(html).toContain("Redemptions");
    }
  });

  it("says plainly why the links are absent, rather than leaving dead cards", () => {
    expect(render(false)).toContain("admin console");
    expect(render(true)).not.toContain("Read-only");
  });

  it("is gated by the page's own guard read, not an assumption", () => {
    const page = readFileSync(
      path.resolve(__dirname, "..", "..", "..", "app", "founder", "page.tsx"),
      "utf8"
    );
    expect(page).toContain("canAccessAdminConsole(user.role)");
    // The raw links must not come back alongside the gated component.
    expect(page).not.toContain('href="/admin/support"');
  });
});
