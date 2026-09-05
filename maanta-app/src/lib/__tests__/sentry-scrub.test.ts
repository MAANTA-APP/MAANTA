import { describe, expect, it } from "vitest";
import { scrubEvent } from "@/lib/sentry-scrub";

/**
 * SEC-010. No current call site attaches PII to a Sentry event — this is the
 * guard that keeps that true as routes change, since `captureRequestError`
 * attaches request context automatically.
 *
 * The last case is the important one: a scrubber that throws inside
 * `beforeSend` takes out error reporting entirely, which is worse than the leak
 * it prevents.
 */

/**
 * scrubEvent returns null when it cannot safely scrub. Every case below except
 * the hostile-getter one expects a real event back, so assert that once here
 * rather than threading non-null assertions through each test.
 */
function scrubbed(input: Record<string, unknown>): Record<string, unknown> {
  const out = scrubEvent(input);
  expect(out, "expected a scrubbed event, not a discard").not.toBeNull();
  return out as Record<string, unknown>;
}

describe("scrubEvent", () => {
  it("redacts sensitive keys in a request body", () => {
    const event = scrubbed({
      request: { data: { otpCode: "123456", phone: "+254712345678", dealId: "d-1" } },
    } as Record<string, unknown>);

    const data = (event.request as Record<string, unknown>).data as Record<string, unknown>;
    expect(data.otpCode).toBe("[REDACTED]");
    expect(data.phone).toBe("[REDACTED]");
    // Non-sensitive fields survive — a scrubbed event still has to be useful.
    expect(data.dealId).toBe("d-1");
  });

  it("redacts the authorization header and cookies", () => {
    const event = scrubbed({
      request: {
        headers: { authorization: "Bearer abc", "content-type": "application/json" },
        cookies: { session: "abc" },
      },
    } as Record<string, unknown>);

    const headers = (event.request as Record<string, unknown>).headers as Record<string, unknown>;
    expect(headers.authorization).toBe("[REDACTED]");
    expect(headers["content-type"]).toBe("application/json");
    expect((event.request as Record<string, unknown>).cookies).toBe("[REDACTED]");
  });

  it("redacts sensitive values in a query string, where a GET carries them", () => {
    const event = scrubbed({
      request: { query_string: "dealId=d-1&otp=123456&token=xyz" },
    } as Record<string, unknown>);

    const qs = (event.request as Record<string, unknown>).query_string as string;
    expect(qs).toContain("dealId=d-1");
    expect(qs).not.toContain("123456");
    expect(qs).not.toContain("xyz");
  });

  it("redacts the waitlist TEST token, which travels as a query param and a body key", () => {
    const event = scrubbed({
      request: {
        query_string: "segment=merchant&test=s3cret-token-with-enough-entropy-0123",
        data: { testToken: "s3cret-token-with-enough-entropy-0123", segment: "merchant" },
      },
    } as Record<string, unknown>);

    expect(JSON.stringify(event)).not.toContain("s3cret-token-with-enough-entropy");
    expect(JSON.stringify(event)).toContain("segment=merchant");
  });

  it("reaches sensitive keys nested inside extra and contexts", () => {
    const event = scrubbed({
      extra: { ledger: { entry: { phone_number: "+254712345678", amount: 500 } } },
      contexts: { payload: { challenge: "shared-secret" } },
    } as Record<string, unknown>);

    expect(JSON.stringify(event)).not.toContain("712345678");
    expect(JSON.stringify(event)).not.toContain("shared-secret");
    // The diagnostic value beside it is untouched.
    expect(JSON.stringify(event)).toContain("500");
  });

  it("scrubs inside arrays", () => {
    const event = scrubbed({
      extra: { items: [{ token: "abc" }, { ok: 1 }] },
    } as Record<string, unknown>);
    expect(JSON.stringify(event)).not.toContain("abc");
  });

  it("is case- and underscore-insensitive about key spellings", () => {
    const event = scrubbed({
      request: { data: { OTP_Code: "123456", Phone_Number: "+254712345678" } },
    } as Record<string, unknown>);
    expect(JSON.stringify(event)).not.toContain("123456");
    expect(JSON.stringify(event)).not.toContain("712345678");
  });

  it("leaves an event with no request or extra untouched", () => {
    const event = scrubbed({ message: "boom" } as Record<string, unknown>);
    expect(event.message).toBe("boom");
  });

  it("never throws, and discards the event if its shape defeats the scrubber", () => {
    // A getter that throws is the realistic version of "shape we did not
    // expect". The first version of this function tried to blank the fields and
    // send anyway, which threw a second time from inside the catch — assigning
    // to a getter-only property is itself an error. Dropping the event is the
    // only fallback that cannot leak.
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, "request", {
      get() {
        throw new Error("hostile getter");
      },
      configurable: true,
      enumerable: true,
    });

    expect(() => scrubEvent(hostile)).not.toThrow();
    expect(scrubEvent(hostile)).toBeNull();
  });

  it("terminates on a deeply nested event", () => {
    let deep: Record<string, unknown> = { token: "abc" };
    for (let i = 0; i < 50; i++) deep = { nested: deep };
    expect(() => scrubEvent({ extra: deep } as Record<string, unknown>)).not.toThrow();
  });
});
