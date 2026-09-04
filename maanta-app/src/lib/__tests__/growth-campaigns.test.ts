import { describe, it, expect } from "vitest";
import {
  buildTrackedLink,
  CAMPAIGN_CHANNEL_MEDIUM,
  CAMPAIGN_DESTINATIONS,
  costPerSignup,
  toCampaignSlug,
  withSignupCounts,
  type Campaign,
} from "@/lib/growth/campaigns";
import { SITEMAP_ROUTES } from "@/lib/marketing/nav";

const ORIGIN = "https://maanta.app";

describe("campaigns — slugs are normalised so attribution cannot split", () => {
  it("lowercases and hyphenates", () => {
    expect(toCampaignSlug("Node 0 Teaser")).toBe("node-0-teaser");
  });

  it("collapses punctuation and trims stray hyphens", () => {
    expect(toCampaignSlug("  BBS — ground floor QR!  ")).toBe("bbs-ground-floor-qr");
  });

  it("produces the same slug for the two spellings that would otherwise split a campaign", () => {
    expect(toCampaignSlug("Node0 Teaser")).toBe(toCampaignSlug("node0   teaser"));
  });
});

describe("campaigns — the link builder", () => {
  it("builds a full tracked URL with all three UTM parameters", () => {
    const link = buildTrackedLink(
      { destination: "/waitlist", channel: "instagram", slug: "node0-teaser" },
      ORIGIN
    );
    expect(link).toBe(
      "https://maanta.app/waitlist?utm_source=instagram&utm_medium=social&utm_campaign=node0-teaser"
    );
  });

  it("does not double the slash on the homepage", () => {
    const link = buildTrackedLink({ destination: "/", channel: "tiktok", slug: "x" }, ORIGIN);
    expect(link.startsWith("https://maanta.app/?")).toBe(true);
  });

  // A dead campaign link is spend converted directly into nothing, and it is
  // discovered by a shopper rather than by us.
  it("refuses a destination the site does not serve", () => {
    expect(() =>
      buildTrackedLink({ destination: "/coming-soon", channel: "offline", slug: "x" }, ORIGIN)
    ).toThrow(/Unknown campaign destination/);
  });

  it("only offers destinations that are in the sitemap", () => {
    expect([...CAMPAIGN_DESTINATIONS].sort()).toEqual(
      SITEMAP_ROUTES.map((r) => r.path).sort()
    );
  });

  it("pins one medium per channel, so a channel cannot report under two", () => {
    expect(CAMPAIGN_CHANNEL_MEDIUM.instagram).toBe("social");
    expect(CAMPAIGN_CHANNEL_MEDIUM.whatsapp).toBe("referral");
    expect(CAMPAIGN_CHANNEL_MEDIUM.offline).toBe("offline");
  });
});

describe("campaigns — cost per signup is honest or absent", () => {
  it("divides spend by signups", () => {
    expect(costPerSignup(6000, 78)).toBe(77);
  });

  // "We spent money and got nobody" is a real and important reading. It is not a
  // cost per signup, and rendering it as one (or as Infinity) hides it.
  it("returns null rather than Infinity when nobody signed up", () => {
    expect(costPerSignup(6000, 0)).toBeNull();
  });

  it("returns null for an owned channel with no spend", () => {
    expect(costPerSignup(null, 51)).toBeNull();
    expect(costPerSignup(0, 51)).toBeNull();
  });
});

describe("campaigns — joining signups", () => {
  const campaign = (over: Partial<Campaign> = {}): Campaign => ({
    id: "c1",
    name: "Node 0 teaser",
    slug: "node0-teaser",
    channel: "instagram",
    destination: "/waitlist",
    status: "running",
    spendKes: 6000,
    isTest: false,
    createdAt: "2026-09-01T00:00:00Z",
    ...over,
  });

  it("counts a campaign with no matching signups as zero, not as missing", () => {
    const joined = withSignupCounts([campaign()], new Map());
    expect(joined[0].signups).toBe(0);
    expect(joined[0].costPerSignup).toBeNull();
  });

  it("attaches the count for a matching slug", () => {
    const joined = withSignupCounts([campaign()], new Map([["node0-teaser", 78]]));
    expect(joined[0].signups).toBe(78);
    expect(joined[0].costPerSignup).toBe(77);
  });
});
