import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * D171 — the blacklist must never go back to being a label with no lever.
 *
 * The defect was not a bug in a code path; it was a *missing* code path, which
 * ordinary unit tests cannot fail on. These assert that the three halves exist
 * together — the enforcement, the write path, and the control next to the chip
 * — because removing any one of them silently restores the original defect.
 */

const repo = (rel: string) => readFileSync(path.resolve(__dirname, "../../..", rel), "utf8");
const src = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("D171 — enforcement", () => {
  const migration = repo("supabase/migrations/20260903130000_enforce_user_blacklist.sql");

  it("claim_deal refuses a blacklisted shopper", () => {
    expect(migration).toContain("user_blacklisted");
    expect(migration).toContain("SELECT u.is_blacklisted INTO v_blacklisted");
  });

  it("checks the flag for service_role too — the only path production uses", () => {
    // Server routes call claim_deal with the service key on the shopper's
    // behalf. A gate that exempted service_role would enforce nothing at all.
    const gate = migration.slice(
      migration.indexOf("SELECT u.is_blacklisted INTO v_blacklisted"),
      migration.indexOf("RAISE EXCEPTION 'user_blacklisted'")
    );
    expect(gate).not.toContain("service_role");
  });

  it("blocks the claim BEFORE a deal allocation slot is reserved", () => {
    // Otherwise a refused claim would burn one of the merchant's D236 slots.
    expect(migration.indexOf("RAISE EXCEPTION 'user_blacklisted'")).toBeLessThan(
      migration.indexOf("RAISE EXCEPTION 'deal_claim_limit_reached'")
    );
  });

  it("leaves verify_redemption alone — verify-anyway is frozen", () => {
    // Blacklisting must never turn into a merchant arguing with a shopper at a
    // till about a code MAANTA itself issued.
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION public.verify_redemption");
    expect(migration).toMatch(/verify-anyway/i);
  });

  it("stops a shopper clearing their own flag, without duplicating the role rule", () => {
    expect(migration).toContain("prevent_self_blacklist_change");
    expect(migration).toContain("cannot change is_blacklisted");
    // `role` is owned by prevent_self_role_escalation; re-checking it here
    // would be a second place for one rule to drift.
    expect(migration).not.toContain("cannot change role");
  });
});

describe("D171 — the control exists wherever the status is shown", () => {
  it("the customer detail page renders the action, not just the chip", () => {
    const page = src("app/admin/customers/[id]/page.tsx");
    expect(page).toContain("CustomerAdminActions");
    expect(page).toContain('label={user.is_blacklisted ? "Blacklisted" : "Active"}');
  });

  it("the control states the boundary an admin needs before acting", () => {
    const ui = src("app/admin/customers/[id]/customer-admin-actions.tsx");
    expect(ui).toMatch(/cannot claim new deals/i);
    // The half admins get wrong: existing codes still work.
    expect(ui).toMatch(/already hold still work at the counter/i);
  });

  it("the write path is admin-guarded and audited", () => {
    const route = src("app/api/admin/customers/[id]/ops/route.ts");
    expect(route).toContain("requireAdminApi");
    expect(route).toContain("logAdminOp");
    expect(route).toContain('targetType: "user"');
  });

  it("admin_ops_log accepts a user target, or the audit silently drops", () => {
    // logAdminOp is best-effort and swallows its error, so a CHECK that
    // rejected 'user' would leave the block with no record of who applied it.
    const migration = repo("supabase/migrations/20260903130000_enforce_user_blacklist.sql");
    expect(migration).toContain("admin_ops_log_target_type_check");
    expect(migration).toContain("'user'::text");
    expect(src("lib/admin-audit.ts")).toContain('| "user"');
  });
});
