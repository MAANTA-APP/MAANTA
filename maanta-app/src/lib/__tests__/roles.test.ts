import { describe, expect, it } from "vitest";
import {
  AGENT_CONSOLE_ROLES,
  FOUNDER_ROLES,
  OPERATOR_ROLES,
  hasAgentConsoleAccess,
  hasFounderAccess,
  isOperator,
  type AppRole,
} from "@/lib/roles";

/**
 * Role predicates behind the four server guards. These lock the CURRENT
 * behaviour (founders are provisioned as `admin`) so the founder-role split
 * documented in docs/skills/founder-role-split.md is a deliberate, visible
 * change to this file rather than a silent drift.
 */

const ALL_ROLES: AppRole[] = [
  "customer",
  "merchant_admin",
  "merchant_staff",
  "agent",
  "admin",
];

const allowed = (fn: (u: { role: AppRole }) => boolean) =>
  ALL_ROLES.filter((role) => fn({ role }));

describe("role predicates", () => {
  it("grants operational admin power to admin only", () => {
    expect(allowed(isOperator)).toEqual(["admin"]);
  });

  it("grants founder dashboard access to admin only (launch posture)", () => {
    expect(allowed(hasFounderAccess)).toEqual(["admin"]);
  });

  it("grants the agent console to agents and admins", () => {
    expect(allowed(hasAgentConsoleAccess)).toEqual(["agent", "admin"]);
  });

  it("denies everything to a signed-out caller", () => {
    for (const fn of [isOperator, hasFounderAccess, hasAgentConsoleAccess]) {
      expect(fn(null)).toBe(false);
      expect(fn(undefined)).toBe(false);
    }
  });

  it("keeps merchant roles out of every operator/founder/agent surface", () => {
    for (const role of ["customer", "merchant_admin", "merchant_staff"] as const) {
      expect(isOperator({ role })).toBe(false);
      expect(hasFounderAccess({ role })).toBe(false);
      expect(hasAgentConsoleAccess({ role })).toBe(false);
    }
  });
});

describe("role lists", () => {
  it("keeps founder access and raw operator power as separate lists", () => {
    // They hold the same value today. The point is that they are two knobs:
    // narrowing founder access must not require editing every guard.
    expect(FOUNDER_ROLES).not.toBe(OPERATOR_ROLES);
    expect([...FOUNDER_ROLES]).toEqual([...OPERATOR_ROLES]);
  });

  it("keeps agent-console access broader than operator power", () => {
    expect([...AGENT_CONSOLE_ROLES]).toContain("agent");
    expect([...OPERATOR_ROLES]).not.toContain("agent");
  });
});
