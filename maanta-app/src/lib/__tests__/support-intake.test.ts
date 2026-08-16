import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ESCALATION_ORIGINS,
  INTAKE_CHANNELS,
  buildIntakeTag,
  buildTicketDescription,
  isEscalationOrigin,
  isIntakeChannel,
} from "@/lib/support-intake";

/**
 * Guards for admin ticket intake (11e). The channel and escalation lists are the
 * user-ruled vocabulary — stall visit, WhatsApp, social media, email, phone; the
 * agent → node manager → admin ladder — so they are pinned, and the tag format is
 * pinned because the queue and any future migration both read it.
 */
describe("intake vocabulary", () => {
  it("carries exactly the ruled channels", () => {
    expect(INTAKE_CHANNELS.map((c) => c.value)).toEqual([
      "stall_visit",
      "whatsapp",
      "social_media",
      "email",
      "phone",
    ]);
  });

  it("carries the escalation ladder below admin, plus direct", () => {
    expect(ESCALATION_ORIGINS.map((o) => o.value)).toEqual([
      "direct",
      "agent",
      "node_manager",
    ]);
  });

  it("validates strictly — an unknown value is rejected, not stored", () => {
    expect(isIntakeChannel("whatsapp")).toBe(true);
    expect(isIntakeChannel("carrier_pigeon")).toBe(false);
    expect(isEscalationOrigin("node_manager")).toBe(true);
    expect(isEscalationOrigin("founder")).toBe(false);
  });
});

describe("the intake tag", () => {
  it("records channel and escalation in one greppable line", () => {
    expect(buildIntakeTag("whatsapp", "agent")).toBe("[via whatsapp · escalated from agent]");
    expect(buildIntakeTag("stall_visit", "node_manager")).toBe(
      "[via stall visit · escalated from node manager]"
    );
  });

  it("omits the escalation clause for direct contact — absence means direct", () => {
    expect(buildIntakeTag("phone", "direct")).toBe("[via phone]");
  });

  it("puts the tag first and the admin's words after", () => {
    expect(buildTicketDescription("email", "direct", "  Shopper says code refused.  ")).toBe(
      "[via email]\nShopper says code refused."
    );
    // No body → just the tag, not a trailing newline.
    expect(buildTicketDescription("email", "direct", "   ")).toBe("[via email]");
  });
});

describe("wiring", () => {
  const APP = path.resolve(__dirname, "..", "..", "app");

  it("the create route validates against the same lists and mirrors the DB CHECKs", () => {
    const route = readFileSync(path.join(APP, "api", "admin", "support", "route.ts"), "utf8");
    expect(route).toContain("isIntakeChannel");
    expect(route).toContain("isEscalationOrigin");
    // The six task types the agent_tasks CHECK allows — validated as a typed 400
    // so a bad value never reaches the DB as an opaque 500.
    for (const t of [
      "retraining",
      "audit",
      "suspension_review",
      "fraud_review",
      "onboarding_followup",
      "dispute_review",
    ]) {
      expect(route).toContain(`"${t}"`);
    }
    expect(route).toContain("logAdminOp");
  });

  it("the support queue links to the form", () => {
    const queue = readFileSync(path.join(APP, "admin", "support", "page.tsx"), "utf8");
    expect(queue).toContain('href="/admin/support/new"');
    // Quiet by rule: the queue's override buttons are the amber actions, so the
    // entry link must not be a second amber (L5).
    expect(queue).not.toMatch(/support\/new[^>]*bg-brand/);
  });

  it("tickets land in agent_tasks — one queue, not a parallel table", () => {
    const route = readFileSync(path.join(APP, "api", "admin", "support", "route.ts"), "utf8");
    expect(route).toContain('from("agent_tasks")');
  });
});
