import { describe, it, expect, afterEach } from "vitest";
import {
  isWaitlistTestToken,
  isWaitlistTestModeConfigured,
} from "@/lib/growth/waitlist-test-token";
import { validateWaitlistSubmission } from "@/lib/waitlist";

const ORIGINAL = process.env.WAITLIST_TEST_TOKEN;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.WAITLIST_TEST_TOKEN;
  else process.env.WAITLIST_TEST_TOKEN = ORIGINAL;
});

describe("waitlist TEST token — fails closed", () => {
  it("marks nothing as a test when no token is configured", () => {
    delete process.env.WAITLIST_TEST_TOKEN;
    expect(isWaitlistTestToken("anything")).toBe(false);
    expect(isWaitlistTestModeConfigured()).toBe(false);
  });

  it("rejects an empty or non-string offer", () => {
    process.env.WAITLIST_TEST_TOKEN = "s3cret-token";
    expect(isWaitlistTestToken("")).toBe(false);
    expect(isWaitlistTestToken(undefined)).toBe(false);
    expect(isWaitlistTestToken(null)).toBe(false);
    expect(isWaitlistTestToken(true)).toBe(false);
    expect(isWaitlistTestToken(["s3cret-token"])).toBe(false);
  });

  it("accepts only the exact token", () => {
    process.env.WAITLIST_TEST_TOKEN = "s3cret-token";
    expect(isWaitlistTestToken("s3cret-token")).toBe(true);
    expect(isWaitlistTestToken("s3cret-toke")).toBe(false);
    expect(isWaitlistTestToken("s3cret-tokenn")).toBe(false);
    expect(isWaitlistTestToken("S3CRET-TOKEN")).toBe(false);
  });

  // timingSafeEqual throws RangeError on unequal buffer lengths, and a
  // String.length guard does not save it — that counts UTF-16 code units while
  // the Buffer counts bytes. Hashing both sides first makes them 32 bytes by
  // construction, so an attacker-chosen length cannot become a 500.
  it("cannot be made to throw by a length or multi-byte mismatch", () => {
    process.env.WAITLIST_TEST_TOKEN = "s3cret-token";
    expect(() => isWaitlistTestToken("x")).not.toThrow();
    expect(() => isWaitlistTestToken("x".repeat(10_000))).not.toThrow();
    // Twelve code units, more than twelve bytes — the exact case a naive
    // length pre-check lets through.
    expect(() => isWaitlistTestToken("émoji-tokén")).not.toThrow();
    expect(() => isWaitlistTestToken("🙂".repeat(12))).not.toThrow();
    expect(isWaitlistTestToken("🙂".repeat(12))).toBe(false);
  });
});

describe("waitlist submission — the body can never mark itself as a test", () => {
  const valid = {
    segment: "shopper",
    fullName: "A M",
    email: "a@example.com",
    phone: "0712345678",
    consent: true,
  };

  it("ignores isTest in the request body", () => {
    const result = validateWaitlistSubmission({ ...valid, isTest: true, testLabel: "sneaky" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.isTest).toBe(false);
    expect(result.data.testLabel).toBeNull();
  });

  it("marks a test only when the caller passes a verified verdict", () => {
    const result = validateWaitlistSubmission(
      { ...valid, testLabel: "smoke-test" },
      { isTest: true }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.isTest).toBe(true);
    expect(result.data.testLabel).toBe("smoke-test");
  });

  it("drops a test label when the submission is not a test", () => {
    const result = validateWaitlistSubmission({ ...valid, testLabel: "smoke-test" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.testLabel).toBeNull();
  });
});
