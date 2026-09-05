import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";
import {
  SHOPPER_INTERESTS,
  WAITLIST_NODE_INTEREST,
  parseWaitlistSegmentParam,
  validateWaitlistSubmission,
} from "@/lib/waitlist";

const SRC = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(path.join(SRC, ...p), "utf8");

const valid = {
  segment: "shopper",
  email: "a@example.com",
  phone: "0712345678",
  consent: true,
};

describe("waitlist funnel — the role parameter", () => {
  it("reads every spelling already linked from the site", () => {
    expect(parseWaitlistSegmentParam("shopper")).toBe("shopper");
    expect(parseWaitlistSegmentParam("merchant")).toBe("merchant");
    expect(parseWaitlistSegmentParam("mall_operator")).toBe("mall_operator");
    // /mall-operators has linked this hyphenated form since 2026-07-31.
    expect(parseWaitlistSegmentParam("mall-operator")).toBe("mall_operator");
    expect(parseWaitlistSegmentParam(" Shopper ")).toBe("shopper");
  });

  it("sends anything else to role selection rather than guessing", () => {
    expect(parseWaitlistSegmentParam(undefined)).toBeNull();
    expect(parseWaitlistSegmentParam("")).toBeNull();
    expect(parseWaitlistSegmentParam("admin")).toBeNull();
    expect(parseWaitlistSegmentParam(["shopper"])).toBeNull();
  });
});

describe("waitlist funnel — the shopper fields", () => {
  it("defaults the mall to Node 0 when the form does not say", () => {
    const r = validateWaitlistSubmission(valid);
    expect(r.ok && r.data.nodeInterest).toBe(WAITLIST_NODE_INTEREST);
  });

  it("records another mall by name, and refuses 'other' with no name", () => {
    const named = validateWaitlistSubmission({ ...valid, mall: "other", mallOther: "  Garden City " });
    expect(named.ok && named.data.nodeInterest).toBe("Garden City");
    expect(validateWaitlistSubmission({ ...valid, mall: "other", mallOther: " " }).ok).toBe(false);
  });

  it("keeps only known interests, once each, and never free text", () => {
    const r = validateWaitlistSubmission({
      ...valid,
      interests: ["shoes", "shoes", "weapons", 42, "kids"],
    });
    expect(r.ok && r.data.interests).toEqual(["shoes", "kids"]);
    expect(SHOPPER_INTERESTS.length).toBeLessThanOrEqual(8);
  });

  it("treats a missing interests field as none", () => {
    const r = validateWaitlistSubmission({ ...valid, interests: "shoes" });
    expect(r.ok && r.data.interests).toEqual([]);
  });
});

describe("waitlist funnel — source guards", () => {
  // Board 2, M8: a test entry sends no message. The API must skip the
  // confirmation email for a TEST signup, not just tag the row.
  it("sends no confirmation email for a test signup", () => {
    const src = read("app", "api", "waitlist", "route.ts");
    expect(src).toMatch(/result\.data\.isTest\s*\?\s*true\s*:\s*await sendWaitlistEmail/);
  });

  // The role cards are the entry point; they must be driven from the shared
  // option list and never pin a segment (the D-lesson from the landing form).
  it("drives role selection from the shared segment list", () => {
    const src = read("app", "(funnel)", "waitlist", "role-select.tsx");
    expect(src).toContain("WAITLIST_SEGMENT_OPTIONS");
    expect(src).toMatch(/method="get"/);
  });

  // The funnel shell owns the single main landmark, like the marketing shell.
  it("gives the funnel shell one main landmark and the skip link", () => {
    const layout = read("app", "(funnel)", "layout.tsx");
    expect(layout).toContain('<main id="main"');
    expect(layout).toContain('href="#main"');
    expect(layout).toContain("PrelaunchNotice");
  });

  // Both forms still avoid the D41 trap: no useSearchParams, no Suspense.
  it("keeps both forms server-renderable", () => {
    for (const file of [
      ["app", "(funnel)", "waitlist", "signup-form.tsx"],
      ["app", "(funnel)", "merchants", "join", "join-form.tsx"],
    ]) {
      // Comments stripped first: both files explain in prose why they avoid it.
      const src = stripComments(read(...file));
      expect(src, file.join("/")).not.toContain("useSearchParams");
      expect(src, file.join("/")).not.toContain("<Suspense");
    }
  });

  // The merchant form posts to the interest endpoint, never into onboarding
  // (founder ruling 2026-09-05), and the confirmation quotes no queue position.
  it("captures merchant interest rather than handing off to onboarding", () => {
    const src = stripComments(read("app", "(funnel)", "merchants", "join", "join-form.tsx"));
    expect(src).toContain('fetch("/api/merchants/interest"');
    expect(src).not.toContain("/merchant/onboard");
    expect(src).not.toMatch(/you're number \d+|join [\d,]+ others/i);
    const signup = stripComments(read("app", "(funnel)", "waitlist", "signup-form.tsx"));
    expect(signup).not.toMatch(/you're number \d+|join [\d,]+ others/i);
  });
});
