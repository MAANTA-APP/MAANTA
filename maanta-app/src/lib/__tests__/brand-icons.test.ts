import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { markSvg, MARK_COLORS, MARK_PATHS } from "@/lib/brand/mark";

/**
 * Guards for the logomark — one definition, every surface.
 *
 * The mark used to be drawn three times: the `Logomark` React component, the
 * manifest's `icon.svg`, and `favicon.ico`. Nothing connected them, so a logo
 * change could land in the header and not in the app icon, and the only way to
 * notice was to install the PWA and look. These tests make that a CI failure.
 *
 * The two committed SVGs are derived artefacts. `npm run brand:icons` writes
 * them from `@/lib/brand/mark`; the first test here rebuilds them in-process and
 * compares, so editing the mark and forgetting the script fails rather than
 * shipping a half-updated logo.
 */
const APP = path.resolve(__dirname, "..", "..");
const ROOT = path.resolve(APP, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("committed icons are rebuilt from the mark module", () => {
  it("public/icon.svg matches markSvg()", () => {
    expect(
      read("public/icon.svg"),
      "stale icon — run `npm run brand:icons`"
    ).toBe(markSvg());
  });

  it("public/icon-maskable.svg matches markSvg({ safeAreaScale: 0.8 })", () => {
    expect(
      read("public/icon-maskable.svg"),
      "stale maskable icon — run `npm run brand:icons`"
    ).toBe(markSvg({ safeAreaScale: 0.8 }));
  });

  it("the maskable variant actually insets the drawing", () => {
    // The whole point: Android crops a maskable icon to roughly the middle 80%.
    // If this ever equals the plain icon, the corners of the badge get shaved on
    // Android and nobody finds out until they install it.
    expect(markSvg({ safeAreaScale: 0.8 })).not.toBe(markSvg());
    expect(markSvg({ safeAreaScale: 0.8 })).toContain("scale(0.8)");
  });

  it("carries no float noise into a committed asset", () => {
    expect(read("public/icon-maskable.svg")).not.toMatch(/\d\.\d{6,}/);
  });
});

describe("every surface derives from the same mark", () => {
  const icons = read("src/components/ui/icons.tsx");

  it("Logomark reads the shared paths rather than redrawing them", () => {
    expect(icons).toContain("MARK_PATHS");
    expect(icons).toContain("@/lib/brand/mark");
    // The old component hardcoded this path. If it comes back, the header and
    // the app icon can disagree again.
    expect(
      icons.includes(MARK_PATHS[0].d),
      "Logomark should map over MARK_PATHS, not inline the path data"
    ).toBe(false);
  });

  it("no raw brand hex survives in the component", () => {
    // `MARK_COLORS.badge` is the single source; a literal here is a second one.
    const inlineHex = icons
      .split("\n")
      .filter((l) => l.includes(MARK_COLORS.badge) && !l.includes("MARK_COLORS"));
    expect(inlineHex, `raw brand hex in icons.tsx:\n${inlineHex.join("\n")}`).toEqual([]);
  });
});

describe("the iOS Add to Home Screen icon exists", () => {
  // This is the defect that started it: the built HTML carried only `rel="icon"`
  // links, iOS Safari ignores the web manifest for Add to Home Screen, and with
  // no apple-touch-icon it screenshots the page and uses that as the icon.
  const appleIcon = read("src/app/apple-icon.tsx");

  it("renders at the size iOS asks for", () => {
    expect(appleIcon).toContain("width: 180");
    expect(appleIcon).toContain("height: 180");
    expect(appleIcon).toContain('contentType = "image/png"');
  });

  it("draws the shared mark rather than its own", () => {
    expect(appleIcon).toContain("markDataUri");
    expect(appleIcon).toContain("@/lib/brand/mark");
  });

  it("is named in metadata.icons, without which it generates but never links", () => {
    // The subtle half of the original defect, and the part a file-existence check
    // would miss entirely. An explicit `icons` object in the root layout
    // OVERRIDES Next's file-convention discovery, so `apple-icon.tsx` was emitted
    // into the build output while the HTML carried only `rel="icon"` links. The
    // route existing is not the same as the link shipping.
    const layout = read("src/app/layout.tsx");
    expect(
      /icons:\s*\{[^}]*apple:/.test(layout),
      "metadata.icons must name `apple`, or the generated icon is never linked"
    ).toBe(true);
  });
});

describe("web manifest icon purposes", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest")) as {
    icons: { src: string; purpose: string }[];
  };

  it("does not declare a full-bleed icon maskable", () => {
    // `purpose: "any maskable"` on the edge-to-edge badge is what cropped the
    // corners on Android. The two purposes need two different drawings.
    const anyIcon = manifest.icons.find((i) => i.src === "/icon.svg");
    expect(anyIcon?.purpose).toBe("any");
  });

  it("offers a real maskable variant", () => {
    const maskable = manifest.icons.find((i) => i.purpose === "maskable");
    expect(maskable?.src).toBe("/icon-maskable.svg");
  });
});
