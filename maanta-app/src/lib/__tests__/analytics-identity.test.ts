import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// These tests pin the thing that made signed-out analytics meaningless: a server
// event must reuse the browser's own PostHog distinct id, so client and server
// events land on one person instead of every signed-out view collapsing onto the
// literal "anonymous".
//
// The cookie payload shape is posthog-js's, not ours, so the parser is tested
// against the real thing: URI-encoded JSON under `ph_<token>_posthog`, with
// `distinct_id` alongside other keys posthog-js stores.

const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

import {
  parsePosthogDistinctId,
  posthogCookieName,
  serverPosthogDistinctId,
} from "@/lib/analytics-identity";

const TOKEN_VAR = "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN";
const TOKEN = "phc_test_token";

/** A realistic posthog-js cookie payload: URI-encoded JSON, several keys. */
function posthogCookie(distinctId: string | null, extra: Record<string, unknown> = {}) {
  const payload: Record<string, unknown> = {
    $sesid: [1785378543331, "019fb0da-a69f-7a32-a0b7-67ccc1731f63", 1785378543331],
    $device_id: "019fb0da-0000-7000-8000-000000000000",
    ...extra,
  };
  if (distinctId !== null) payload.distinct_id = distinctId;
  return encodeURIComponent(JSON.stringify(payload));
}

describe("analytics identity", () => {
  const origToken = process.env[TOKEN_VAR];

  beforeEach(() => {
    cookieStore.clear();
    process.env[TOKEN_VAR] = TOKEN;
  });
  afterEach(() => {
    if (origToken === undefined) delete process.env[TOKEN_VAR];
    else process.env[TOKEN_VAR] = origToken;
  });

  describe("posthogCookieName", () => {
    it("matches the name posthog-js persists under", () => {
      expect(posthogCookieName()).toBe(`ph_${TOKEN}_posthog`);
    });

    it("trims a padded token, so a stray newline in env config still resolves", () => {
      process.env[TOKEN_VAR] = `  ${TOKEN}\n`;
      expect(posthogCookieName()).toBe(`ph_${TOKEN}_posthog`);
    });

    it("is null when no token is configured (dev / CI)", () => {
      delete process.env[TOKEN_VAR];
      expect(posthogCookieName()).toBeNull();
    });
  });

  describe("parsePosthogDistinctId", () => {
    it("reads distinct_id out of a real posthog-js payload", () => {
      expect(parsePosthogDistinctId(posthogCookie("019fb0da-abc"))).toBe("019fb0da-abc");
    });

    it("accepts an already-decoded payload", () => {
      const decoded = JSON.stringify({ distinct_id: "plain-json" });
      expect(parsePosthogDistinctId(decoded)).toBe("plain-json");
    });

    it("trims surrounding whitespace on the id", () => {
      expect(parsePosthogDistinctId(posthogCookie("  padded-id  "))).toBe("padded-id");
    });

    it.each([
      ["empty", ""],
      ["undefined", undefined],
      ["null", null],
      ["not JSON at all", "not-json"],
      ["a JSON array", encodeURIComponent(JSON.stringify(["nope"]))],
      ["a JSON string", encodeURIComponent(JSON.stringify("nope"))],
      ["malformed percent-encoding", "%E0%A4%A"],
    ])("returns null for %s", (_label, raw) => {
      expect(parsePosthogDistinctId(raw as string | null | undefined)).toBeNull();
    });

    it("returns null when the payload has no distinct_id", () => {
      expect(parsePosthogDistinctId(posthogCookie(null))).toBeNull();
    });

    it.each([
      ["a blank string", ""],
      ["whitespace only", "   "],
    ])("returns null when distinct_id is %s", (_label, value) => {
      expect(parsePosthogDistinctId(posthogCookie(value))).toBeNull();
    });

    it("returns null when distinct_id is not a string", () => {
      const raw = encodeURIComponent(JSON.stringify({ distinct_id: 12345 }));
      expect(parsePosthogDistinctId(raw)).toBeNull();
    });
  });

  describe("serverPosthogDistinctId", () => {
    it("reads the id from the request's posthog cookie", () => {
      cookieStore.set(`ph_${TOKEN}_posthog`, posthogCookie("browser-person-1"));
      expect(serverPosthogDistinctId()).toBe("browser-person-1");
    });

    it("is null when the cookie is absent (first ever view, or cookies blocked)", () => {
      expect(serverPosthogDistinctId()).toBeNull();
    });

    it("ignores a cookie belonging to a different project token", () => {
      cookieStore.set("ph_some_other_token_posthog", posthogCookie("wrong-project"));
      expect(serverPosthogDistinctId()).toBeNull();
    });

    it("is null when no token is configured, without reading cookies", () => {
      delete process.env[TOKEN_VAR];
      cookieStore.set(`ph_${TOKEN}_posthog`, posthogCookie("ignored"));
      expect(serverPosthogDistinctId()).toBeNull();
    });
  });
});
