import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { redactTestToken, scrubAnalyticsEvent } from "@/lib/analytics-scrub";

const TOKEN = "s3cret-token-with-enough-entropy-to-honour-0123";

describe("analytics scrub — the waitlist TEST token never reaches PostHog", () => {
  it("redacts the test parameter wherever it sits in a URL", () => {
    expect(redactTestToken(`https://maanta.app/waitlist?test=${TOKEN}`)).toBe(
      "https://maanta.app/waitlist?test=[REDACTED]"
    );
    expect(redactTestToken(`/waitlist?segment=merchant&test=${TOKEN}&x=1`)).toBe(
      "/waitlist?segment=merchant&test=[REDACTED]&x=1"
    );
    expect(redactTestToken(`/waitlist#test=${TOKEN}`)).toBe("/waitlist#test=[REDACTED]");
  });

  it("leaves other parameters, and keys that merely contain the word, alone", () => {
    expect(redactTestToken("/deals?latest=1&contest=2&segment=shopper")).toBe(
      "/deals?latest=1&contest=2&segment=shopper"
    );
    expect(redactTestToken("plain text with test=inside")).toBe("plain text with test=inside");
  });

  it("scrubs every string under properties, $set and $set_once, at any depth", () => {
    const event = scrubAnalyticsEvent({
      event: "$pageview",
      properties: {
        $current_url: `https://maanta.app/waitlist?test=${TOKEN}`,
        $referrer: `https://maanta.app/?test=${TOKEN}`,
        nested: { deeper: [`/waitlist?test=${TOKEN}`] },
        untouched: 42,
      },
      $set: { last_url: `/waitlist?test=${TOKEN}` },
      $set_once: { $initial_current_url: `/waitlist?test=${TOKEN}` },
    });
    expect(JSON.stringify(event)).not.toContain(TOKEN);
    expect(event.properties.untouched).toBe(42);
    expect(event.event).toBe("$pageview");
  });

  it("passes a dropped event through", () => {
    expect(scrubAnalyticsEvent(null)).toBeNull();
  });

  // The hook only protects anything if it is actually wired in.
  it("is registered as PostHog's before_send", () => {
    const src = readFileSync(
      path.resolve(__dirname, "..", "..", "components", "posthog-provider.tsx"),
      "utf8"
    );
    expect(src).toMatch(/before_send:\s*scrubAnalyticsEvent/);
  });
});
