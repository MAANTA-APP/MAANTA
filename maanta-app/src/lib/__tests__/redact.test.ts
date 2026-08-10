import { describe, expect, it } from "vitest";
import { redactFreeText, redactWebhookPayload } from "@/lib/redact";

/**
 * SEC-006 / drift D85. `payment_webhook_failures.payload` persisted whatever the
 * provider sent, minus one key. An IntaSend M-Pesa payload carries the payer's
 * number, so the number was stored verbatim on every failure branch.
 *
 * The contract these lock: allowlist (unknown fields lose their value), keys
 * preserved (so an unfamiliar payload is still diagnosable), phones masked via
 * the same maskPhone the rest of the app uses.
 */

/** A realistic IntaSend COMPLETE callback, including the fields that carry PII. */
const INTASEND_PAYLOAD = {
  invoice_id: "inv_123",
  state: "COMPLETE",
  api_ref: "topup:11111111-1111-1111-1111-111111111111:abc",
  value: 500,
  currency: "KES",
  challenge: "the-shared-secret",
  phone_number: "+254712345678",
  account: "254712345678",
  name: "Jane Shopper",
  email: "jane@example.com",
  failed_reason: null,
};

describe("redactWebhookPayload", () => {
  const redacted = redactWebhookPayload(INTASEND_PAYLOAD) as Record<string, unknown>;

  it("never stores the payer's phone number in any field that carries it", () => {
    const serialised = JSON.stringify(redacted);
    expect(serialised).not.toContain("712345678");
    expect(serialised).not.toContain("254712345678");
  });

  it("masks phone fields rather than dropping them, using the shared masker", () => {
    // Enough to confirm which payment this was, not enough to identify anyone.
    expect(redacted.phone_number).toBe("+254 7xx xxx 678");
    expect(redacted.account).toBe("+254 7xx xxx 678");
  });

  it("still redacts the shared secret", () => {
    expect(redacted.challenge).toBe("[REDACTED]");
  });

  it("redacts name and email, which are not diagnostic", () => {
    expect(redacted.name).toBe("[REDACTED]");
    expect(redacted.email).toBe("[REDACTED]");
  });

  it("keeps the fields an ops reviewer actually needs", () => {
    expect(redacted.invoice_id).toBe("inv_123");
    expect(redacted.state).toBe("COMPLETE");
    expect(redacted.api_ref).toBe(INTASEND_PAYLOAD.api_ref);
    expect(redacted.value).toBe(500);
    expect(redacted.currency).toBe("KES");
  });

  it("preserves every key, so an unfamiliar payload shape stays diagnosable", () => {
    expect(Object.keys(redacted).sort()).toEqual(Object.keys(INTASEND_PAYLOAD).sort());
  });

  it("redacts an unknown field by default rather than letting it through", () => {
    // The allowlist's whole point: a provider adding a field tomorrow does not
    // silently start persisting it.
    const out = redactWebhookPayload({ some_new_pii_field: "sensitive" }) as Record<
      string,
      unknown
    >;
    expect(out.some_new_pii_field).toBe("[REDACTED]");
  });

  it("recurses into nested objects, where PII also hides", () => {
    const out = redactWebhookPayload({
      customer: { phone_number: "+254712345678", email: "x@y.com" },
      state: "FAILED",
    }) as Record<string, unknown>;
    const customer = out.customer as Record<string, unknown>;
    expect(customer.phone_number).toBe("+254 7xx xxx 678");
    expect(customer.email).toBe("[REDACTED]");
    expect(JSON.stringify(out)).not.toContain("712345678");
  });

  it("recurses into arrays", () => {
    const out = redactWebhookPayload({
      charges: [{ phone_number: "+254712345678" }],
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain("712345678");
  });

  it("is case-insensitive about key names", () => {
    const out = redactWebhookPayload({ Phone_Number: "+254712345678" }) as Record<
      string,
      unknown
    >;
    expect(out.Phone_Number).toBe("+254 7xx xxx 678");
  });

  it("fully redacts a phone value too short for maskPhone to mask safely", () => {
    // maskPhone returns null rather than reveal most of a short number; that
    // must become a redaction, never a passthrough.
    const out = redactWebhookPayload({ phone_number: "12345" }) as Record<string, unknown>;
    expect(out.phone_number).toBe("[REDACTED]");
  });

  it("passes through null and non-object input untouched", () => {
    expect(redactWebhookPayload(null)).toBeNull();
    expect(redactWebhookPayload(undefined)).toBeUndefined();
    expect(redactWebhookPayload("a string body")).toBe("a string body");
  });

  it("terminates on a deeply nested payload", () => {
    let deep: Record<string, unknown> = { phone_number: "+254712345678" };
    for (let i = 0; i < 50; i++) deep = { nested: deep };
    expect(() => redactWebhookPayload(deep)).not.toThrow();
  });
});

describe("redactFreeText", () => {
  it("masks a phone number embedded in an unparsed provider response", () => {
    const out = redactFreeText('{"error":"bad number 254712345678"}');
    expect(out).not.toContain("254712345678");
    // 12 digits in, first 2 and last 2 kept, the middle 8 masked.
    expect(out).toContain("25xxxxxxxx78");
  });

  it("leaves short numbers readable, so amounts and status codes still help", () => {
    expect(redactFreeText("status 400, amount 500")).toBe("status 400, amount 500");
  });
});
