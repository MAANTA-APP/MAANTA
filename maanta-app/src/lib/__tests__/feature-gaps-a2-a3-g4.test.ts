import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// A2 / A3 / G4 feature-gap closure — structural guards. These lock in that the
// new admin/agent surfaces exist, stay role-gated, and keep the frozen money
// typography (tabular ink, never amber). See docs/skills/ui-feature-gaps-closed.md.

const SRC = path.resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
const has = (rel: string) => existsSync(path.join(SRC, rel));

describe("A2 — admin customers list", () => {
  const rel = "app/admin/customers/page.tsx";
  it("route exists and is admin-gated", () => {
    expect(has(rel)).toBe(true);
    expect(read(rel)).toContain("requireAdminPage()");
  });
  it("lists from public.users, not a shadow schema", () => {
    expect(read(rel)).toMatch(/\.from\("users"\)/);
  });
  it("is linked from the admin sidebar", () => {
    expect(read("components/nav/admin-sidebar.tsx")).toContain("/admin/customers");
  });
});

describe("A3 — admin redemption detail", () => {
  const rel = "app/admin/redemptions/[id]/page.tsx";
  it("route exists and is admin-gated", () => {
    expect(has(rel)).toBe(true);
    expect(read(rel)).toContain("requireAdminPage()");
  });
  it("shows the money snapshot the money path wrote", () => {
    const src = read(rel);
    expect(src).toContain("amount_kes");
    expect(src).toContain("success_fee_charged");
  });
  it("renders money in tabular ink, never amber", () => {
    const src = read(rel);
    expect(src).toContain("tnum");
    expect(src).not.toContain("text-brand");
  });
  it("links redemption rows from the fraud/list page to the detail route", () => {
    expect(read("app/admin/redemptions/page.tsx")).toContain(
      "/admin/redemptions/${r.id}"
    );
  });
});

describe("G4 — agent lead↔merchant linkage", () => {
  it("agent segment is role-gated at the layout", () => {
    expect(has("app/agent/layout.tsx")).toBe(true);
    expect(read("app/agent/layout.tsx")).toContain("requireAgentPage");
  });
  it("lead detail route exists and enforces the agent guard", () => {
    const rel = "app/agent/leads/[id]/page.tsx";
    expect(has(rel)).toBe(true);
    expect(read(rel)).toContain("requireAgentPage");
  });
  it("link API writes only attribution columns (converted_to / status)", () => {
    const rel = "app/api/leads/[id]/link/route.ts";
    expect(has(rel)).toBe(true);
    const src = read(rel);
    expect(src).toContain("requireActiveAgentApi");
    expect(src).toContain("converted_to");
    // Attribution only — must not touch money/ledger columns.
    expect(src).not.toMatch(/account_balance|success_fee|outstanding_arrears/);
  });
  it("only offers merchants the agent onboarded (attribution boundary)", () => {
    const src = read("app/api/leads/[id]/link/route.ts");
    expect(src).toContain("onboarded_by");
  });
});
