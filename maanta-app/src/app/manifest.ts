import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "@/lib/marketing/live-claims";
import { rasterManifestIcons } from "@/lib/brand/app-icons";

/**
 * The web app manifest — generated, not a static file in `public/`. Drift **D138**.
 *
 * ## Why it moved
 *
 * `public/manifest.webmanifest` carried `"description": "Discover, claim and
 * redeem live mall deals. Now live at BBS Mall, Eastleigh."` — the post-launch
 * sentence, ungated, while the company is neither incorporated nor
 * ODPC-registered and every page footer says it is not yet trading. That string
 * is matched by the `TRADING` regex in
 * `src/lib/__tests__/prelaunch-consistency.test.ts`, and the guard never saw it:
 * it walked `.tsx` under `src/app/(marketing)` and `src/components/marketing`,
 * so `public/` was outside its coverage by construction.
 *
 * The manifest description is the worst-placed instance of that claim, not the
 * least: it is what the Android install prompt and the app listing render, at
 * the exact moment someone installs, on a surface `PrelaunchNotice` cannot
 * follow. Same argument D46 made for the OG image and D87 for the root
 * description.
 *
 * **A static JSON file cannot read `DEMO_MODE`**, which is very likely why it was
 * missed when D87 routed twenty-one claim sites through `live-claims.ts`. So the
 * manifest became code. Next's `app/manifest.ts` file convention serves it at
 * `/manifest.webmanifest` — the same URL the static file had — so
 * `src/app/layout.tsx`'s `manifest` reference did not need to move, and no
 * installed client sees a changed path.
 *
 * ## Icons
 *
 * Four entries, two drawings, one source. `purpose: "any"` gets the full-bleed
 * badge; `purpose: "maskable"` gets the 80% safe-area inset, because Android
 * crops a maskable icon and a mark that bleeds to the edge loses its corners —
 * declaring one un-padded asset as both is the defect **D93** recorded.
 *
 * Each purpose is offered as **SVG and as raster PNG at 192 and 512**: an
 * install target that will not take SVG previously had nothing at all to use,
 * since `public/` held no PNG. The rasters are generated from the same
 * `@/lib/brand/mark` geometry by `src/app/icons/[icon]/route.tsx`, so they cannot
 * drift from the header logo — and, per **D114**, they draw the *previous*
 * shield rather than the newly supplied artwork, which is still awaiting a
 * square opaque export. Nothing here promises an icon the product does not yet
 * deliver.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Maanta — The mall, made live.",
    short_name: "Maanta",
    description: SITE_DESCRIPTION,
    // The post-login fallback for every role, and the first screen an installed
    // user sees. Listed in `design/current-reality/frames.json` since D94.
    start_url: "/app-bootstrap",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#FDBF2D",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      // Derived from the same array `src/app/icons/[icon]/route.tsx` generates
      // from, so a declared raster that nothing serves cannot be written here.
      ...(rasterManifestIcons() ?? []),
    ],
  };
}
