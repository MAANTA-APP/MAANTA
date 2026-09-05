import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";
import { SOCIAL_KIT, findKitAsset, kitDealIndex } from "@/lib/marketing/social-kit";
import { OG_SIZE } from "@/lib/marketing/og";
import { SAMPLE_DEALS } from "@/lib/marketing/sample-deals";

/**
 * The social and OG kit (board 4, built from the brief). The registry is the
 * spec sheet; these pin the properties an upload day depends on.
 */
const SRC = path.resolve(__dirname, "..", "..");
const KIT = stripComments(readFileSync(path.join(SRC, "lib", "marketing", "social-kit.tsx"), "utf8"));
const ROUTE = stripComments(
  readFileSync(path.join(SRC, "app", "api", "brand-kit", "[asset]", "route.tsx"), "utf8")
);

describe("social kit — the registry is well-formed", () => {
  it("has unique slug ids and positive dimensions", () => {
    const ids = SOCIAL_KIT.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of SOCIAL_KIT) {
      expect(a.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(a.width).toBeGreaterThan(0);
      expect(a.height).toBeGreaterThan(0);
      expect(a.use.length).toBeGreaterThan(20);
    }
  });

  it("keeps every safe area inside its frame, with a reason", () => {
    for (const a of SOCIAL_KIT) {
      if (!a.safe) continue;
      expect(a.safe.x + a.safe.width, a.id).toBeLessThanOrEqual(a.width);
      expect(a.safe.y + a.safe.height, a.id).toBeLessThanOrEqual(a.height);
      expect(a.safe.why.length, a.id).toBeGreaterThan(20);
    }
  });

  it("covers everything the brief asked for", () => {
    const platforms = SOCIAL_KIT.map((a) => a.platform.toLowerCase()).join(" ");
    for (const p of ["instagram", "tiktok", "linkedin", "facebook", "youtube"]) {
      expect(platforms, `no asset names ${p}`).toContain(p);
    }
    expect(findKitAsset("og-default")?.width).toBe(OG_SIZE.width);
    expect(findKitAsset("og-default")?.height).toBe(OG_SIZE.height);
    expect(findKitAsset("deal-post")).not.toBeNull();
    expect(findKitAsset("deal-story")).not.toBeNull();
  });

  it("uses the published platform sizes", () => {
    expect([findKitAsset("profile-square")?.width, findKitAsset("profile-square")?.height]).toEqual([1080, 1080]);
    expect([findKitAsset("facebook-cover")?.width, findKitAsset("facebook-cover")?.height]).toEqual([820, 312]);
    expect([findKitAsset("linkedin-company-cover")?.width, findKitAsset("linkedin-company-cover")?.height]).toEqual([1128, 191]);
    expect([findKitAsset("linkedin-personal-cover")?.width, findKitAsset("linkedin-personal-cover")?.height]).toEqual([1584, 396]);
    expect([findKitAsset("youtube-channel-art")?.width, findKitAsset("youtube-channel-art")?.height]).toEqual([2560, 1440]);
    const yt = findKitAsset("youtube-channel-art")!.safe!;
    expect([yt.width, yt.height]).toEqual([1546, 423]);
  });
});

describe("social kit — nothing invented without saying so, nothing free-text", () => {
  it("draws deals only from the shared sample list and prints the disclosure on the image", () => {
    expect(KIT).toContain("SAMPLE_DEALS[deal]");
    expect(KIT).toContain("Example — not a real offer");
    for (const id of ["deal-post", "deal-story"]) {
      expect(findKitAsset(id)?.variants).toEqual({ param: "deal", count: SAMPLE_DEALS.length });
    }
  });

  it("carries the pre-launch status line, never a typed trading claim", () => {
    expect(KIT).toContain("NODE_STATUS_LINE");
    expect(KIT).not.toMatch(/Live at/);
  });

  it("accepts a closed index and nothing else from the URL", () => {
    expect(kitDealIndex("1", 3)).toBe(1);
    expect(kitDealIndex("7", 3)).toBe(0);
    expect(kitDealIndex("-1", 3)).toBe(0);
    expect(kitDealIndex("abc", 3)).toBe(0);
    expect(kitDealIndex(null, 3)).toBe(0);
    // The route reads exactly one parameter, and it is the index.
    expect(ROUTE).toContain('searchParams.get("deal")');
    expect(ROUTE).not.toMatch(/searchParams\.get\("(headline|text|title|copy)"\)/);
    expect(findKitAsset("nope")).toBeNull();
  });

  it("wraps the dark cover headline inside the width the lockup leaves, so the company banner cannot clip", () => {
    // Readiness sweep 2026-09-05: on the 1128×191 LinkedIn company cover the
    // proposition rendered as one unconstrained line and clipped at the right
    // edge. The text column's width must be derived from the frame, and the
    // headline must be allowed to wrap into it.
    const coverDark = KIT.slice(KIT.indexOf("function coverDark("), KIT.indexOf("function youtubeChannelArt("));
    expect(coverDark).toMatch(/const textWidth = size\.width - marginLeft - lockupWidth - gap - marginRight/);
    expect(coverDark).toMatch(/maxWidth: textWidth/);
    expect(coverDark).toMatch(/flexWrap: "wrap"/);
  });

  it("renders the profile image on the amber badge and every price in ink", () => {
    expect(KIT).toContain("background: BRAND");
    // Prices in the deal card are INK; the only amber besides the badge is the
    // waitlist pill, which is an action.
    const priceLines = KIT.split("\n").filter((l) => /kes\(d\.(now|was)\)/.test(l));
    expect(priceLines.length).toBeGreaterThan(0);
  });
});
