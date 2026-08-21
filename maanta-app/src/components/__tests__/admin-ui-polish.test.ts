import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Admin actions must not fail silently: an operator action that errors has to
 * say so (checked response + announced error), or a failed fraud approval,
 * deal removal or support override is indistinguishable from success.
 */
describe("Admin UI polish", () => {
  const ACTION_FILES = [
    "src/app/admin/redemptions/fraud-actions.tsx",
    "src/app/admin/deals/moderation-actions.tsx",
    "src/app/admin/support/override-button.tsx",
  ];

  it.each(ACTION_FILES)("%s surfaces failures instead of swallowing them", (file) => {
    const src = read(file);
    expect(src).not.toContain("catch(() => null)");
    expect(src).toContain("res.ok");
    expect(src).toContain('role="alert"');
  });

  it("admin error text is announced on the trust-critical actions", () => {
    for (const file of [
      "src/app/admin/redemptions/[id]/reverse-fee-action.tsx",
      "src/app/admin/redemptions/[id]/release-actions.tsx",
      "src/app/admin/redemptions/[id]/appeal-actions.tsx",
      "src/app/admin/merchants/[id]/merchant-admin-actions.tsx",
      "src/app/admin/billing/plan-actions.tsx",
    ]) {
      expect(read(file), file).toContain('role="alert"');
    }
  });

  it("customers table scrolls horizontally instead of clipping", () => {
    const src = read("src/app/admin/customers/page.tsx");
    expect(src).toMatch(/overflow-x-auto[^\n]*\n\s*<table/);
  });

  it("agent lead actions announce errors and expose selection state", () => {
    const form = read("src/app/agent/leads/new/new-lead-form.tsx");
    expect(form).toContain('role="alert"');

    const link = read("src/app/agent/leads/[id]/link-merchant.tsx");
    expect(link).toContain('role="alert"');
    // The candidate picker's selection dot is aria-hidden — aria-pressed is
    // what makes the chosen shop perceivable at all without vision.
    expect(link).toContain("aria-pressed={selected === m.id}");
  });

  it("agent weekly-target bar guards a zero target", () => {
    // Unguarded, 0/0 divides to Infinity and paints a full bar over
    // "0 / 0 shops".
    const src = read("src/app/agent/page.tsx");
    expect(src).toContain("agent.weekly_target > 0");
  });
});
