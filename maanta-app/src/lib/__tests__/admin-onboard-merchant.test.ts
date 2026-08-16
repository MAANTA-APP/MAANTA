import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Guards for admin-assisted onboarding.
 *
 * The subject is attribution, not the form. `merchants.onboarding_mode` and
 * `onboarded_by_user_id` are read by dispute and fraud review, so the failure
 * that matters is not "the shop was not created" — it is "the shop was created
 * and the record says the wrong person did it".
 */
const ROOT = path.resolve(__dirname, "..", "..", "..");
const route = readFileSync(
  path.join(ROOT, "src", "app", "api", "admin", "merchants", "onboard", "route.ts"),
  "utf8"
);
const migration = readFileSync(
  path.join(
    ROOT,
    "supabase",
    "migrations",
    "20260816020000_admin_assisted_onboarding_attribution.sql"
  ),
  "utf8"
);
const merchantRoute = readFileSync(
  path.join(ROOT, "src", "app", "api", "merchants", "onboard", "route.ts"),
  "utf8"
);

describe("the admin route records the admin as the actor", () => {
  it("passes the acting admin, never the merchant, as p_admin_user_id", () => {
    expect(route).toContain("p_admin_user_id: admin.id");
  });

  it("never sends agent attribution on this path", () => {
    // Admin-assisted and agent-assisted are mutually exclusive; the DB raises if
    // both arrive, and the route must not be the thing that sends both.
    expect(route).toContain("p_onboarding_agent_id: null");
  });

  it("fails closed when the migration is absent, rather than writing a false record", () => {
    // The tempting fallback — retry with the 11-argument signature — would
    // record the merchant as having self-served. That is the defect this whole
    // change exists to avoid, so its absence is pinned.
    expect(route).toContain("migration_required");
    expect(route).toContain("20260816020000");
    expect(route).not.toMatch(/p_admin_user_id:\s*null/);
  });

  it("is admin-guarded and audited", () => {
    expect(route).toContain("requireAdminApi");
    expect(route).toContain("logAdminOp");
    expect(route).toContain('action: "merchant.onboard"');
  });

  it("names the real reason when the person has no account", () => {
    // The RPC requires an existing users row; "user_not_found" must not surface
    // as a generic 500 an admin cannot act on.
    expect(route).toContain("user_not_found");
    expect(route).toContain("sign in once first");
  });

  it("requires what3words, like the merchant-authored form", () => {
    // An admin-created shop is not exempt from what makes it findable in-mall.
    expect(route).toContain("w3w_required");
  });
});

describe("the merchant-authored path is untouched", () => {
  it("still never sends an admin attribution", () => {
    // /api/merchants/onboard is the merchant-authored route: the submitter IS
    // the merchant and an agent can only ever be attribution. If this ever
    // starts sending p_admin_user_id, the merchant-authored guarantee is gone.
    expect(merchantRoute).not.toContain("p_admin_user_id");
  });
});

describe("the migration keeps every attribution rule it inherited", () => {
  it("validates the named admin before stamping it", () => {
    expect(migration).toMatch(/role = 'admin'/);
    expect(migration).toContain("invalid_attribution: p_admin_user_id does not reference an admin");
  });

  it("refuses admin and agent attribution together", () => {
    expect(migration).toContain("not both");
  });

  it("rejects the parameter on the authenticated path", () => {
    // There the acting admin is the caller; accepting a parameter would let one
    // admin's action be stamped as another's.
    expect(migration).toContain("only accepted from service_role");
  });

  it("adds the parameter without breaking existing call sites", () => {
    // Trailing and defaulted: every existing 11-argument call keeps working.
    expect(migration).toMatch(/p_admin_user_id uuid DEFAULT NULL\s*\)/);
  });

  it("leaves self-serve and agent-assisted attribution as they were", () => {
    expect(migration).toContain("v_onboarding_mode := 'self_serve'");
    expect(migration).toContain("v_onboarding_mode := 'agent_assisted'");
    expect(migration).toMatch(/p_onboarding_agent_id does not reference an active agent/);
  });
});
