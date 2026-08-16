import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

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

  it("drops the stale overload the signature change creates", () => {
    // CREATE OR REPLACE does not replace across a changed argument list — it
    // adds an overload. Left in place, an 11-argument call (what the
    // merchant-authored route sends) matches the old signature exactly and the
    // new one by default, which Postgres rejects as ambiguous. CI caught this.
    expect(migration).toMatch(/DROP FUNCTION IF EXISTS public\.onboard_merchant\(/);
    expect(migration).toMatch(
      /DROP FUNCTION IF EXISTS public\.onboard_merchant\(\s*uuid,(\s*text,){9}\s*uuid\s*\)/
    );
  });

  it("re-locks the new function object away from anon", () => {
    // A new function object carries Postgres's default PUBLIC execute grant
    // rather than inheriting 20260701132109's lockdown — so without this, an
    // attribution fix would have handed anon an onboarding function.
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION[\s\S]*?FROM PUBLIC, anon/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO authenticated, service_role/);
  });

  it("qualifies the COMMENT by signature", () => {
    // An unqualified COMMENT ON FUNCTION is ambiguous whenever an overload
    // exists — the exact statement that failed CI.
    expect(migration).not.toMatch(/COMMENT ON FUNCTION public\.onboard_merchant IS/);
    expect(migration).toMatch(/COMMENT ON FUNCTION public\.onboard_merchant\(/);
  });

  it("leaves self-serve and agent-assisted attribution as they were", () => {
    expect(migration).toContain("v_onboarding_mode := 'self_serve'");
    expect(migration).toContain("v_onboarding_mode := 'agent_assisted'");
    expect(migration).toMatch(/p_onboarding_agent_id does not reference an active agent/);
  });
});

describe("phone validation is wider here, and only here", () => {
  const topupRoute = readFileSync(
    path.join(ROOT, "src", "app", "api", "topup", "route.ts"),
    "utf8"
  );

  // Comments are stripped before asserting, via the one shared lexer (D38).
  // These routes explain their own choice of validator in prose and name the
  // other one while doing it, so a raw substring check reads a *mention* as a
  // *call* — which is how the first version of this suite failed on a comment
  // that documented the very rule it was guarding.
  const adminCode = stripComments(route);
  const merchantCode = stripComments(merchantRoute);
  const topupCode = stripComments(topupRoute);

  it("accepts an international shop number on the admin path", () => {
    expect(adminCode).toContain("isValidInternationalPhone");
    expect(adminCode).not.toContain("isValidKenyanPhone");
  });

  it("keeps the merchant-authored path Kenya-only", () => {
    // A shop owner standing in BBS Mall entering a foreign number is far more
    // likely a typo than a fact. Widening this route is a separate decision.
    expect(merchantCode).toContain("isValidKenyanPhone");
    expect(merchantCode).not.toContain("isValidInternationalPhone");
  });

  it("keeps the M-Pesa top-up path Kenya-only", () => {
    // This number goes to the provider for an STK push. A non-Kenyan MSISDN
    // cannot receive one, so widening here would trade a clear 400 for a
    // failed payment.
    expect(topupCode).toContain("isValidKenyanPhone");
    expect(topupCode).not.toContain("isValidInternationalPhone");
  });
});
