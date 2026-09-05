import { describe, it, expect, afterEach } from "vitest";
import {
  isWaitlistTestToken,
  WAITLIST_TEST_TOKEN_MIN_LENGTH,
} from "@/lib/growth/waitlist-test-token";
import { validateWaitlistSubmission } from "@/lib/waitlist";

// Long enough to be honoured; the floor is the subject of its own test below.
const TOKEN = "s3cret-token-with-enough-entropy-to-honour-0123";

const ORIGINAL = process.env.WAITLIST_TEST_TOKEN;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.WAITLIST_TEST_TOKEN;
  else process.env.WAITLIST_TEST_TOKEN = ORIGINAL;
});

describe("waitlist TEST token — fails closed", () => {
  it("marks nothing as a test when no token is configured", () => {
    delete process.env.WAITLIST_TEST_TOKEN;
    expect(isWaitlistTestToken("anything")).toBe(false);
  });

  // A guessable token needs no timing oracle. Below the floor it is the same as
  // unset — refused even when the offer matches exactly.
  it("ignores a configured token that is shorter than the floor", () => {
    expect(TOKEN.length).toBeGreaterThanOrEqual(WAITLIST_TEST_TOKEN_MIN_LENGTH);
    const short = "s3cret-token";
    expect(short.length).toBeLessThan(WAITLIST_TEST_TOKEN_MIN_LENGTH);
    process.env.WAITLIST_TEST_TOKEN = short;
    expect(isWaitlistTestToken(short)).toBe(false);
    process.env.WAITLIST_TEST_TOKEN = "x".repeat(WAITLIST_TEST_TOKEN_MIN_LENGTH - 1);
    expect(isWaitlistTestToken("x".repeat(WAITLIST_TEST_TOKEN_MIN_LENGTH - 1))).toBe(false);
    process.env.WAITLIST_TEST_TOKEN = "x".repeat(WAITLIST_TEST_TOKEN_MIN_LENGTH);
    expect(isWaitlistTestToken("x".repeat(WAITLIST_TEST_TOKEN_MIN_LENGTH))).toBe(true);
  });

  it("rejects an empty or non-string offer", () => {
    process.env.WAITLIST_TEST_TOKEN = TOKEN;
    expect(isWaitlistTestToken("")).toBe(false);
    expect(isWaitlistTestToken(undefined)).toBe(false);
    expect(isWaitlistTestToken(null)).toBe(false);
    expect(isWaitlistTestToken(true)).toBe(false);
    expect(isWaitlistTestToken([TOKEN])).toBe(false);
  });

  it("accepts only the exact token", () => {
    process.env.WAITLIST_TEST_TOKEN = TOKEN;
    expect(isWaitlistTestToken(TOKEN)).toBe(true);
    expect(isWaitlistTestToken(TOKEN.slice(0, -1))).toBe(false);
    expect(isWaitlistTestToken(TOKEN + "n")).toBe(false);
    expect(isWaitlistTestToken(TOKEN.toUpperCase())).toBe(false);
  });

  // timingSafeEqual throws RangeError on unequal buffer lengths, and a
  // String.length guard does not save it — that counts UTF-16 code units while
  // the Buffer counts bytes. Hashing both sides first makes them 32 bytes by
  // construction, so an attacker-chosen length cannot become a 500.
  it("cannot be made to throw by a length or multi-byte mismatch", () => {
    process.env.WAITLIST_TEST_TOKEN = TOKEN;
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
    location: "bbs",
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
