import type { MetadataRoute } from "next";

/**
 * The raster app icons the web manifest declares and the icon route generates —
 * one definition, both ends. Drift **D93**.
 *
 * `public/` held `icon.svg` and `icon-maskable.svg` and no raster at all, so an
 * install target that will not take SVG had nothing to fall back to. These are
 * the 192 and 512 PNGs Android asks for, in both purposes.
 *
 * This module exists because a Next route file may only export the fields Next
 * recognises, so the specs cannot live beside the handler that renders them. That
 * is a better outcome anyway: `src/app/manifest.ts` builds its `icons` entries
 * from this same array, so a manifest `src` pointing at a raster the route cannot
 * produce is unrepresentable rather than merely tested for.
 *
 * `safeAreaScale` 0.8 is the maskable safe area — Android crops a maskable icon
 * to roughly the middle 80%, so a mark that bleeds to the edge loses its corners.
 * Declaring one un-padded asset as both purposes is the defect D93 recorded.
 */
export type AppIconSpec = {
  /** File name, and the last path segment of the generated route. */
  readonly name: string;
  readonly size: 192 | 512;
  readonly safeAreaScale: number;
  readonly purpose: "any" | "maskable";
};

export const APP_ICONS: readonly AppIconSpec[] = [
  { name: "icon-192.png", size: 192, safeAreaScale: 1, purpose: "any" },
  { name: "icon-512.png", size: 512, safeAreaScale: 1, purpose: "any" },
  { name: "icon-maskable-192.png", size: 192, safeAreaScale: 0.8, purpose: "maskable" },
  { name: "icon-maskable-512.png", size: 512, safeAreaScale: 0.8, purpose: "maskable" },
] as const;

/** Where the icon route serves them from. Stable, unlike a hashed metadata URL. */
export const APP_ICON_BASE = "/icons";

export const APP_ICON_NAMES: readonly string[] = APP_ICONS.map((i) => i.name);

export function findAppIcon(name: string): AppIconSpec | undefined {
  return APP_ICONS.find((i) => i.name === name);
}

/** The manifest `icons` entries for the rasters, derived rather than retyped. */
export function rasterManifestIcons(): MetadataRoute.Manifest["icons"] {
  return APP_ICONS.map((i) => ({
    src: `${APP_ICON_BASE}/${i.name}`,
    sizes: `${i.size}x${i.size}`,
    type: "image/png",
    purpose: i.purpose,
  }));
}
