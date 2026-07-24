import { describe, expect, it, vi } from "vitest";
import {
  normalizeAgentId,
  resolveOnboardingAgentId,
  onboardingMode,
  type AgentLookup,
} from "@/lib/agent-attribution";

const VALID = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";

const lookup = (active: boolean): AgentLookup => ({
  isActiveAgent: vi.fn(async () => active),
});

describe("normalizeAgentId", () => {
  it("accepts a well-formed UUID (trimmed)", () => {
    expect(normalizeAgentId(VALID)).toBe(VALID);
    expect(normalizeAgentId(`  ${VALID}  `)).toBe(VALID);
  });

  it("rejects non-UUIDs and non-strings", () => {
    expect(normalizeAgentId("not-a-uuid")).toBeNull();
    expect(normalizeAgentId("")).toBeNull();
    expect(normalizeAgentId(null)).toBeNull();
    expect(normalizeAgentId(123)).toBeNull();
    expect(normalizeAgentId({})).toBeNull();
  });
});

describe("resolveOnboardingAgentId (G1/G4 attribution)", () => {
  it("returns the id when it references an active agent", async () => {
    expect(await resolveOnboardingAgentId(VALID, lookup(true))).toBe(VALID);
  });

  it("returns null when the agent is not active", async () => {
    expect(await resolveOnboardingAgentId(VALID, lookup(false))).toBeNull();
  });

  it("returns null (self-serve) with no id — and never calls the DB", async () => {
    const l = lookup(true);
    expect(await resolveOnboardingAgentId(null, l)).toBeNull();
    expect(await resolveOnboardingAgentId("garbage", l)).toBeNull();
    expect(l.isActiveAgent).not.toHaveBeenCalled();
  });

  it("fails safe to null if the lookup throws (never breaks onboarding)", async () => {
    const throwing: AgentLookup = {
      isActiveAgent: vi.fn(async () => {
        throw new Error("agents read failed");
      }),
    };
    expect(await resolveOnboardingAgentId(VALID, throwing)).toBeNull();
  });
});

describe("onboardingMode", () => {
  it("maps a present id → agent_assisted, null → self_serve", () => {
    expect(onboardingMode(VALID)).toBe("agent_assisted");
    expect(onboardingMode(null)).toBe("self_serve");
  });
});
