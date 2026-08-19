import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { markSvg, MARK_COLORS, MARK_PATHS } from "@/lib/brand/mark";
import manifest from "@/app/manifest";
import { stripComments } from "./helpers/comment-stripping";
import { APP_ICON_NAMES } from "@/lib/brand/app-icons";

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
const code = (abs: string) => readFileSync(abs, "utf8");

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
  // Reads the generated manifest, not `public/manifest.webmanifest` — that file
  // was deleted when the manifest became code so its description could be gated
  // on DEMO_MODE (D138). Asserting the module is strictly better: it is what the
  // route actually serves.
  const icons = manifest().icons ?? [];

  it("does not declare a full-bleed icon maskable", () => {
    // `purpose: "any maskable"` on the edge-to-edge badge is what cropped the
    // corners on Android. The two purposes need two different drawings.
    const anyIcon = icons.find((i) => i.src === "/icon.svg");
    expect(anyIcon?.purpose).toBe("any");
  });

  it("offers a real maskable variant", () => {
    const maskable = icons.find((i) => i.purpose === "maskable");
    expect(maskable?.src).toBe("/icon-maskable.svg");
  });

  /**
   * D93's remaining repo-side half: `public/` held two SVGs and no raster at
   * all, so an install target that will not take SVG had nothing to fall back
   * to. Both purposes must now be offered at the two sizes Android asks for.
   */
  it("offers raster PNGs at 192 and 512 for both purposes", () => {
    for (const purpose of ["any", "maskable"] as const) {
      const sizes = icons
        .filter((i) => i.purpose === purpose && i.type === "image/png")
        .map((i) => i.sizes);
      expect(sizes, `no raster ${purpose} icon declared`).toContain("192x192");
      expect(sizes, `no raster ${purpose} icon declared`).toContain("512x512");
    }
  });

  /**
   * Every raster the manifest names must be one the route can actually produce.
   * A typo in a `src` would otherwise ship a manifest pointing at a 404, which
   * is invisible until someone installs the app.
   */
  it("declares only rasters the icon route generates", () => {
    const declared = icons
      .filter((i) => i.type === "image/png")
      .map((i) => (i.src as string).replace("/icons/", ""));
    expect(declared.length).toBeGreaterThan(0);
    for (const name of declared) {
      expect(APP_ICON_NAMES).toContain(name);
    }
  });

  it("draws the rasters from the shared mark, not a committed binary", () => {
    // Comment-stripped through the shared D38 lexer: this file's own docblock
    // names the supplied artwork to explain why it is not used, and a raw
    // substring check would report that explanation as the violation.
    const route = stripComments(
      code(path.join(APP, "app", "icons", "[icon]", "route.tsx"))
    );
    expect(route).toContain("markDataUri");
    expect(route).toContain("@/lib/brand/mark");
    // D114: the newly supplied artwork waits for a square opaque export, so no
    // icon surface may point at it yet. Matched as a URL string — the leading
    // quote is what separates `src="/brand/maanta-icon.png"` from the module
    // path `@/lib/brand/mark`, which is exactly what this route should import.
    expect(route).not.toContain('"/brand/');
  });
});

describe("the iOS home-screen metadata is declared", () => {
  // D93: without `appleWebApp`, the home-screen title and status-bar style are
  // undefined and iOS falls back to the full document title.
  const layout = read("src/app/layout.tsx");

  it("names appleWebApp with a short title", () => {
    expect(layout).toMatch(/appleWebApp:\s*\{/);
    expect(layout).toMatch(/title:\s*"Maanta"/);
    expect(layout).toMatch(/capable:\s*true/);
  });
});

/**
 * D114 — two marks ship at once, and the register must say so for exactly as
 * long as that is true.
 *
 * The header and footer render the new supplied lockup while the favicon,
 * manifest icons, iOS touch icon and `Logomark` still draw the previous shield,
 * because the supplied icon has its rounding baked in and is too small to
 * repackage. That is a deliberate, founder-instructed gap — but a deliberate gap
 * with no expiry is just drift with a good excuse.
 *
 * So this binds the two together in both directions. Repoint `mark.ts` at the
 * new artwork and forget to close D114, and this fails. Close D114 while the old
 * shield is still being drawn, and it fails too.
 */
describe("D114 stays open exactly as long as the marks differ", () => {
  const OLD_SHIELD = "M24 9.5 35 14v9c0 7.5-4.7 12.6-11 15-6.3-2.4-11-7.5-11-15v-9l11-4.5z";
  const register = readFileSync(
    path.resolve(ROOT, "..", "docs", "maanta-drift-register.md"),
    "utf8"
  );
  const row = register.split("\n").find((l) => l.startsWith("| D114 |"));
  const stillOldMark = code(path.join(ROOT, "src", "lib", "brand", "mark.ts")).includes(
    OLD_SHIELD
  );

  it("has a D114 row at all", () => {
    expect(row, "D114 should exist while the site ships two marks").toBeTruthy();
  });

  it("matches the row's status to what mark.ts actually draws", () => {
    const isOpen = row?.startsWith("| D114 | open |");
    expect(
      isOpen,
      stillOldMark
        ? "mark.ts still draws the previous shield, so D114 must stay open"
        : "mark.ts no longer draws the previous shield — close D114, the marks now agree"
    ).toBe(stillOldMark);
  });
});

describe("the marketing shells render the supplied lockup", () => {
  const header = code(path.join(ROOT, "src", "components", "marketing", "SiteHeader.tsx"));
  const footer = code(path.join(ROOT, "src", "components", "marketing", "SiteFooter.tsx"));

  it("uses one lockup asset rather than a mark plus an approximated wordmark", () => {
    for (const [name, src] of [
      ["SiteHeader", header],
      ["SiteFooter", footer],
    ] as const) {
      expect(src, `${name} should render BrandLockup`).toContain("<BrandLockup");
      expect(
        src.includes("<Logomark"),
        `${name} should not render both a lockup and a separate mark`
      ).toBe(false);
    }
  });

  it("does not announce the brand twice to a screen reader", () => {
    // Both links already carry aria-label="MAANTA home", so the image is alt="".
    const lockup = code(
      path.join(ROOT, "src", "components", "marketing", "BrandLockup.tsx")
    );
    expect(lockup).toContain('alt=""');
    expect(header).toContain('aria-label="MAANTA home"');
    expect(footer).toContain('aria-label="MAANTA home"');
  });

  it("ships both light and dark variants of the lockup", () => {
    // Shipping only the variant in use today is how the other one is forgotten
    // and someone renders a black wordmark on an ink surface.
    expect(existsSync(path.join(ROOT, "public", "brand", "maanta-lockup-horizontal.png"))).toBe(
      true
    );
    expect(
      existsSync(path.join(ROOT, "public", "brand", "maanta-lockup-horizontal-white.png"))
    ).toBe(true);
  });
});
