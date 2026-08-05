import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimCodeEmail,
  emailCodeDeliveryEnabled,
} from "@/lib/email-code-delivery";

// Pre-launch email copy of the claim code (D74). Two truths pinned here:
// the gate defaults ON until launch and turns off only by explicit env, and
// the email never carries a price (frozen UI rule 6 extends to the email —
// the code stands alone).

describe("emailCodeDeliveryEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults ON while the env var is unset (pre-launch behaviour)", () => {
    vi.stubEnv("MAANTA_EMAIL_CODE_DELIVERY", "");
    expect(emailCodeDeliveryEnabled()).toBe(true);
  });

  it.each(["off", "false", "0", " OFF ", "False"])(
    "turns off for explicit %j",
    (v) => {
      vi.stubEnv("MAANTA_EMAIL_CODE_DELIVERY", v);
      expect(emailCodeDeliveryEnabled()).toBe(false);
    }
  );

  it("stays on for any other value (fail toward the pre-launch default)", () => {
    vi.stubEnv("MAANTA_EMAIL_CODE_DELIVERY", "on");
    expect(emailCodeDeliveryEnabled()).toBe(true);
  });
});

describe("claimCodeEmail", () => {
  const email = claimCodeEmail({
    code: "123456",
    dealTitle: "2-for-1 lunch",
    merchantName: "Java House",
    expiresAt: "2026-08-05T12:00:00Z",
  });

  it("carries the code in the display format the ticket uses", () => {
    expect(email.text).toContain("123 456");
    expect(email.html).toContain("123 456");
  });

  it("names the deal and the shop in subject and body", () => {
    expect(email.subject).toContain("2-for-1 lunch");
    expect(email.text).toContain("Java House");
  });

  it("carries no price — the code stands alone (frozen UI rule 6)", () => {
    expect(email.text).not.toMatch(/KES/i);
    expect(email.html).not.toMatch(/KES/i);
  });

  it("escapes HTML in merchant-supplied strings", () => {
    const hostile = claimCodeEmail({
      code: "654321",
      dealTitle: `<script>alert("x")</script>`,
      merchantName: null,
      expiresAt: "2026-08-05T12:00:00Z",
    });
    expect(hostile.html).not.toContain("<script>");
    expect(hostile.html).toContain("&lt;script&gt;");
  });

  it("states the Nairobi-local validity of the code", () => {
    // 12:00Z is 15:00 in Nairobi (UTC+3, no DST).
    expect(email.text).toContain("Valid until:");
    expect(email.text).toMatch(/3:00\s?pm|15:00/i);
  });
});
