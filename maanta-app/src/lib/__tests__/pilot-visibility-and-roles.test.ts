import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";
import { withPublicMerchant } from "@/lib/data";
import { canAccessAdminConsole, canAccessFounderDashboard } from "@/lib/roles";

/**
 * Two review findings, guarded.
 *
 * **Shopper-visible supply must mean what the feed means.** PR 5's first draft
 * counted a deal as visible on the deal-side conditions alone — active, not
 * paused, unexpired — and omitted the merchant side entirely. A deal on a
 * suspended, hidden or shadow-banned merchant reaches nobody, so the command
 * centre would have reported supply no shopper could see, and the "no
 * shopper-visible supply" alert would have stayed silent for exactly the
 * merchants most in need of it.
 *
 * **A cofounder must not be shown an admin-only link.** `/founder/yesterday`
 * admits founder roles; `/admin/pilot` does not. Rendering the link
 * unconditionally hands a cofounder a link that bounces them off the page they
 * were reading.
 */

/** Chainable stub recording the filters a helper applies. */
function recorder() {
  const calls: [string, unknown][] = [];
  const q = {
    calls,
    eq(column: string, value: unknown) {
      calls.push([column, value]);
      return q;
    },
  };
  return q;
}

const columns = (q: ReturnType<typeof recorder>) => q.calls.map(([c]) => c);

describe("shopper-visible supply uses the canonical public-merchant rule", () => {
  it("excludes suspended, hidden and shadow-banned merchants", () => {
    const q = recorder();
    withPublicMerchant(q);
    // An active, unpaused, unexpired deal is NOT shopper-visible unless all
    // three merchant conditions hold.
    expect(q.calls).toEqual(
      expect.arrayContaining([
        ["merchants.status", "active"],
        ["merchants.is_visible", true],
        ["merchants.is_shadow_banned", false],
      ])
    );
  });

  it("excludes synthetic rows on both sides by default", () => {
    const q = recorder();
    withPublicMerchant(q);
    expect(columns(q)).toContain("is_demo");
    expect(columns(q)).toContain("merchants.is_demo");
  });

  it("keeps the merchant conditions when demo rows are deliberately included", () => {
    // Demo mode widens WHAT counts as real, never WHO can be seen: a hidden or
    // suspended merchant stays invisible in demo mode too.
    const q = recorder();
    withPublicMerchant(q, { includeDemo: true });
    expect(columns(q)).toContain("merchants.status");
    expect(columns(q)).toContain("merchants.is_visible");
    expect(columns(q)).toContain("merchants.is_shadow_banned");
    expect(columns(q)).not.toContain("is_demo");
  });
});

describe("the pilot command centre wires that rule in, rather than re-deriving it", () => {
  const src = stripComments(
    readFileSync(path.join(__dirname, "../../app/admin/pilot/page.tsx"), "utf8")
  );

  it("routes its shopper-visible count through withPublicMerchant", () => {
    expect(src).toContain("withPublicMerchant(");
    expect(src).toContain('from "@/lib/data"');
  });

  it("brings the merchant join the rule needs", () => {
    expect(src).toContain("merchants!inner(status,is_visible,is_shadow_banned,is_demo)");
  });

  it("still applies the deal-side conditions", () => {
    for (const filter of ['"is_active", true', '"is_paused", false', '.gt("expires_at"']) {
      expect(src).toContain(filter);
    }
  });

  it("uses the cohort-compatible verified count for funnel figures", () => {
    // P1 regression: throughput (redeemed_at) must not feed conversion or the
    // claims-without-visits rule.
    expect(src).toContain("verifiedCohort");
    expect(src).toContain('.gte("claimed_at", since)');
  });
});

describe("role boundaries around the admin-only pilot link", () => {
  it("separates founder-dashboard access from admin-console access", () => {
    expect(canAccessFounderDashboard("cofounder")).toBe(true);
    expect(canAccessAdminConsole("cofounder")).toBe(false);
    expect(canAccessFounderDashboard("admin")).toBe(true);
    expect(canAccessAdminConsole("admin")).toBe(true);
  });

  it("gates the /admin/pilot link on admin-console access, not founder access", () => {
    const src = stripComments(
      readFileSync(path.join(__dirname, "../../app/founder/yesterday/page.tsx"), "utf8")
    );
    expect(src).toContain("canAccessAdminConsole");
    // The link must sit behind the gate, never rendered unconditionally.
    expect(src).toMatch(/canOpenAdminConsole \?[\s\S]{0,200}\/admin\/pilot/);
  });

  it("keeps the founder-dashboard card behind the same existing gate", () => {
    const src = stripComments(
      readFileSync(path.join(__dirname, "../../components/founder/operations-links.tsx"), "utf8")
    );
    expect(src).toContain("/admin/pilot");
    expect(src).toContain("canOpenAdminConsole");
  });
});

describe("throughput columns are windowed by their own event timestamps", () => {
  const src = stripComments(
    readFileSync(path.join(__dirname, "../../app/admin/pilot/page.tsx"), "utf8")
  );

  it("windows arrivals by arrived_at, not by when the claim happened", () => {
    // Windowing by claimed_at counted an arrival only if the CLAIM fell in the
    // period, so someone who claimed last week and walked in yesterday was
    // invisible — a throughput column under-reporting the thing it is named
    // after.
    expect(src).toMatch(/\.gte\("arrived_at", since\)/);
    expect(src).not.toMatch(/not\("arrived_at", "is", null\)[\s\S]{0,200}gte\("claimed_at", since\)/);
  });

  it("windows Fast Visits by the persisted verdict's own timestamp", () => {
    expect(src).toMatch(/\.gte\("fast_visit_qualified_at", since\)/);
  });

  it("keeps the claim-cohort count on claimed_at, so funnel figures stay compatible", () => {
    expect(src).toMatch(/verifiedCohortRes/);
    expect(src).toMatch(/\.eq\("status", "success"\)\s*\n\s*\.gte\("claimed_at", since\)/);
  });

  it("marks throughput columns so they cannot be read as cohort figures", () => {
    expect(src).toContain("Arrivals*");
    expect(src).toContain("Fast Visits*");
    expect(src).toContain("Verified*");
    expect(src).toMatch(/THROUGHPUT count/);
  });
});

describe("every admin-only link on the Yesterday brief is gated, not just the first", () => {
  const yesterday = () =>
    stripComments(
      readFileSync(
        path.join(process.cwd(), "src/app/founder/yesterday/page.tsx"),
        "utf8"
      )
    );

  /**
   * Round 3, and the same defect a third time: `requireFounderPage` admits
   * `admin` AND `cofounder`, every `/admin/*` route admits admins only, so any
   * ungated link on this page bounces a cofounder to `/` and off the brief.
   *
   * Gating the pilot link fixed one instance and left three — the
   * `/admin/redemptions`, `/admin/approvals` and `/admin/support` hrefs in the
   * unresolved-queue alerts. Guarding the specific link that was reported would
   * have guarded the instance and not the rule, so this asserts the property:
   * no `/admin/*` href may be rendered by this page outside a
   * `canOpenAdminConsole` decision.
   */
  it("passes the admin-console capability into every queue alert", () => {
    const src = yesterday();
    const alerts = src.match(/<Alert\b[\s\S]*?\/>/g) ?? [];
    expect(alerts.length).toBeGreaterThanOrEqual(3);
    for (const alert of alerts) {
      expect(alert).toContain("canOpenAdminConsole={canOpenAdminConsole}");
    }
  });

  it("makes the capability a required prop, so a fourth alert cannot skip it", () => {
    // Optional would let the next alert be added ungated and still compile —
    // which is exactly how three of them ended up ungated.
    const src = yesterday();
    expect(src).toMatch(/canOpenAdminConsole: boolean;/);
    expect(src).not.toMatch(/canOpenAdminConsole\?: boolean/);
  });

  it("renders the alert as plain text rather than hiding it from a cofounder", () => {
    // The queue is real and a cofounder needs to know it exists. Withholding
    // the navigation is correct; withholding the alert would be an operator
    // reading silence as an all-clear — the failure this page exists to stop.
    const src = yesterday();
    expect(src).toMatch(
      /canOpenAdminConsole \?\s*\([\s\S]{0,400}?<Link[\s\S]{0,400}?\)\s*:\s*\(\s*<p[\s\S]{0,120}?\{noun\(count\)\}/
    );
    expect(src).toMatch(/which this role cannot open/);
  });

  it("leaves no /admin href on the page outside a capability check", () => {
    // The property, not the three instances: every admin route mentioned here
    // must sit inside a component that takes the gate.
    const src = yesterday();
    const adminHrefs = src.match(/href="\/admin[^"]*"/g) ?? [];
    for (const href of adminHrefs) {
      const idx = src.indexOf(href);
      const window = src.slice(Math.max(0, idx - 600), idx + 600);
      expect(window, `ungated admin link: ${href}`).toContain("canOpenAdminConsole");
    }
  });
});
