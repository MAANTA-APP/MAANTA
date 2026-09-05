import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Marketing analytics.
 *
 * Verified here rather than in a browser on purpose. A live check against a
 * PostHog project needs a real token — with a placeholder, remote config fails
 * and posthog-js disables capture entirely, so a browser probe reports "no
 * events" whether the wiring is correct or not. Mocking the transport tests the
 * thing actually under our control: that `trackMarketing` calls capture with the
 * right name, that it stays silent without a token, and that it never throws.
 *
 * The second block is the one that matters for privacy: a submit event must
 * record that a submission happened, never what was typed.
 */

const capture = vi.fn();
vi.mock("posthog-js", () => ({ default: { capture: (...a: unknown[]) => capture(...a) } }));

const SRC = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(path.join(SRC, ...p), "utf8");

const ORIGINAL_TOKEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

beforeEach(() => {
  capture.mockReset();
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc_test";
  vi.stubGlobal("window", {});
});

afterEach(() => {
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = ORIGINAL_TOKEN;
  vi.unstubAllGlobals();
});

describe("trackMarketing", () => {
  it("captures the event with a marketing surface tag", async () => {
    const { trackMarketing } = await import("@/lib/marketing/analytics");
    const { MARKETING_EVENTS } = await import("@/lib/marketing/analytics-events");

    trackMarketing(MARKETING_EVENTS.audienceDoor, { name: "Merchants", location: "doors" });

    expect(capture).toHaveBeenCalledWith("marketing_audience_door_clicked", {
      surface: "marketing",
      name: "Merchants",
      location: "doors",
    });
  });

  it("is a no-op without a project token, so dev and CI stay silent", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "";
    vi.resetModules();
    const { trackMarketing } = await import("@/lib/marketing/analytics");
    const { MARKETING_EVENTS } = await import("@/lib/marketing/analytics-events");

    trackMarketing(MARKETING_EVENTS.cta, { name: "x", location: "y" });
    expect(capture).not.toHaveBeenCalled();
  });

  it("never throws into a render path when capture fails", async () => {
    capture.mockImplementation(() => {
      throw new Error("posthog exploded");
    });
    vi.resetModules();
    const { trackMarketing } = await import("@/lib/marketing/analytics");
    const { MARKETING_EVENTS } = await import("@/lib/marketing/analytics-events");

    expect(() => trackMarketing(MARKETING_EVENTS.cta, { name: "x", location: "y" })).not.toThrow();
  });
});

describe("marketing analytics wiring", () => {
  // The event names are a dashboard contract; a rename silently orphans a chart.
  it("keeps the event names stable", async () => {
    const { MARKETING_EVENTS } = await import("@/lib/marketing/analytics-events");
    expect(MARKETING_EVENTS).toEqual({
      audienceDoor: "marketing_audience_door_clicked",
      cta: "marketing_cta_clicked",
      formSubmit: "marketing_form_submitted",
      faqOpened: "marketing_faq_opened",
      sectionViewed: "marketing_section_viewed",
    });
  });

  // The constants must not live in the "use client" module: the Home page is a
  // server component and passes MARKETING_EVENTS.audienceDoor as a prop, which
  // broke the React Client Manifest and failed the production build.
  it("keeps event constants out of the client-only module", () => {
    const events = read("lib", "marketing", "analytics-events.ts");
    expect(events.startsWith('"use client"')).toBe(false);
    expect(read("lib", "marketing", "analytics.ts").startsWith('"use client"')).toBe(true);
  });

  it("tracks the three audience doors — the page's most useful measurement", () => {
    const home = read("app", "(marketing)", "page.tsx");
    expect(home).toContain("MARKETING_EVENTS.audienceDoor");
    expect(home).toContain("TrackedLink");
  });

  it("tracks both form submissions", () => {
    expect(read("components", "marketing", "EnquiryRouter.tsx")).toContain(
      "MARKETING_EVENTS.formSubmit"
    );
    // `join-form.tsx`, not `page.tsx`: the route was split on 2026-08-01 so the
    // server shell could export `metadata` (drift D52), and the tracked submit
    // handler moved with the form. This guard caught that move, which is the
    // point of it — an untracked merchant lead form is invisible in the funnel.
    expect(read("app", "(funnel)", "merchants", "join", "join-form.tsx")).toContain(
      "MARKETING_EVENTS.formSubmit"
    );
  });

  // Privacy: an event may record that a submission happened and where from —
  // never the message body, the contact detail, the name or the shop name.
  it("never sends form field contents to analytics", () => {
    /**
     * Extract exactly the `trackMarketing(...)` call, paren-balanced. A fixed
     * character window overran into the surrounding handler, which legitimately
     * mentions `message` and `contact` when building the request body — the
     * check has to read the call, not its neighbourhood.
     */
    const submitCall = (src: string): string => {
      const marker = src.indexOf("MARKETING_EVENTS.formSubmit");
      expect(marker, "expected a formSubmit event in this file").toBeGreaterThan(-1);
      const open = src.lastIndexOf("(", marker);
      let depth = 0;
      for (let i = open; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")" && --depth === 0) return src.slice(open, i + 1);
      }
      throw new Error("unbalanced trackMarketing call");
    };

    /**
     * Strip string literals before checking. What leaks a field value is passing
     * the *variable* — `contact`, `message` — not naming the form `"contact"`.
     * Without this the check fails on `{ form: "contact" }`, which carries no
     * user data at all, and the obvious "fix" would be renaming the form rather
     * than removing a field.
     */
    const identifiersOnly = (call: string) => call.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""');

    const contactCall = identifiersOnly(
      submitCall(read("components", "marketing", "EnquiryRouter.tsx"))
    );
    for (const field of ["message", "contact", "name"]) {
      expect(
        new RegExp(`\\b${field}\\b`).test(contactCall),
        `the contact submit event must not carry "${field}" — got: ${contactCall}`
      ).toBe(false);
    }

    const joinCall = identifiersOnly(
      submitCall(read("app", "(funnel)", "merchants", "join", "join-form.tsx"))
    );
    for (const field of ["shopName", "phone"]) {
      expect(
        new RegExp(`\\b${field}\\b`).test(joinCall),
        `the join submit event must not carry "${field}" — got: ${joinCall}`
      ).toBe(false);
    }
  });

  it("reports each viewport section only once", () => {
    const tracked = read("components", "marketing", "tracked.tsx");
    expect(tracked).toContain("io.disconnect()");
    expect(tracked).toContain("setSeen(true)");
  });
});
