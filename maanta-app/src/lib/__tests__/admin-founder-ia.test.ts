import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { stripComments } from "./helpers/comment-stripping";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/approvals" }));

import { AdminSidebar } from "@/components/nav/admin-sidebar";
import { FounderHeader } from "@/components/nav/founder-header";

/**
 * The 2026-09-03 information architecture, pinned.
 *
 * Founder brief: the admin console's navigation is task-oriented — what needs
 * attention, then the things an operator handles — with low-frequency system
 * tools below a divider. The founder shell is a different job (understand and
 * command the pilot), with its own pages first in its own header. These guards
 * keep both from drifting back into a column of database objects.
 */
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("admin sidebar — task-oriented order", () => {
  const html = renderToStaticMarkup(createElement(AdminSidebar));
  const hrefs = (html.match(/href="[^"]+"/g) ?? []).map((h) => h.slice(6, -1));

  it("lists the nine task sections in the brief's order, before any system tool", () => {
    const expected = [
      "/admin",
      "/admin/queue",
      "/admin/merchants",
      "/admin/customers",
      "/admin/deals",
      "/admin/visits",
      "/admin/support",
      "/admin/operations",
      "/admin/audit",
    ];
    expect(hrefs.slice(0, expected.length)).toEqual(expected);
  });

  it("keeps billing, reports and resources as system tools below the sections", () => {
    const audit = hrefs.indexOf("/admin/audit");
    for (const sys of ["/admin/billing", "/admin/reports", "/admin/resources"]) {
      expect(hrefs.indexOf(sys), `${sys} must sit below the task sections`).toBeGreaterThan(audit);
    }
    expect(html).toContain("System");
  });

  it("no longer lists approvals, pilot, agents or redemptions as top-level items", () => {
    // They still exist as routes; they are reached from the section that owns
    // them. A top-level item for each is the resource-oriented list the brief
    // replaced.
    for (const demoted of ["/admin/approvals", "/admin/pilot", "/admin/agents", "/admin/redemptions"]) {
      expect(hrefs).not.toContain(demoted);
    }
  });

  it("lights the owning section when an operator is on a demoted route", () => {
    // usePathname is mocked to /admin/approvals above: Merchants owns it.
    expect(html).toMatch(/aria-current="page"[^>]*>Merchants</);
  });

  it("labels the shopper directory as shoppers, not customers", () => {
    expect(html).toContain(">Shoppers<");
    expect(html).not.toContain(">Customers<");
  });
});

describe("founder header — its own pages first", () => {
  it("links the command centre, the daily brief and reports for every founder role", () => {
    for (const can of [true, false]) {
      const html = renderToStaticMarkup(createElement(FounderHeader, { canOpenAdminConsole: can }));
      for (const href of ["/founder", "/founder/yesterday", "/founder/reports"]) {
        expect(html).toContain(`href="${href}"`);
      }
    }
  });
});

describe("founder reports no longer bounce a co-founder", () => {
  const src = stripComments(read("src/app/founder/reports/page.tsx"));

  it("renders under the founder guard rather than redirecting into the admin shell", () => {
    expect(src).toContain("requireFounderPage");
    expect(src).not.toContain("requireAdminPage");
    expect(src).not.toMatch(/redirect\(\s*["']\/admin/);
  });

  it("shares one report component with the admin route, so the money cannot differ", () => {
    const admin = stripComments(read("src/app/admin/reports/page.tsx"));
    for (const page of [src, admin]) {
      expect(page).toContain('from "@/components/admin/platform-report"');
      expect(page).toContain("<PlatformReport");
    }
    // The range pills stay inside the shell that rendered them.
    expect(src).toContain('basePath="/founder/reports"');
    expect(admin).toContain('basePath="/admin/reports"');
  });
});
