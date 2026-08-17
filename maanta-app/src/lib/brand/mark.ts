/**
 * The MAANTA logomark — one definition, every surface.
 *
 * Before this module the mark was drawn three separate times: `Logomark()` in
 * `src/components/ui/icons.tsx` (site header, footer, auth chrome, download
 * panel, merchant and onboarding pages), `public/icon.svg` for the web manifest,
 * and `src/app/favicon.ico` as opaque binary. Changing the logo meant editing
 * each and trusting them to stay identical, which is the same "second place to
 * enforce a rule is a second place to drift" problem the repo avoids everywhere
 * else. Now the geometry lives here and everything derives from it.
 *
 * ## Replacing the artwork
 *
 * Change `MARK_PATHS` and `MARK_COLORS`, run `npm run brand:icons`, and every
 * surface follows: the React component re-renders, the two SVG files are
 * rewritten, and the iOS touch icon is regenerated at build time. A test asserts
 * the committed SVGs still match this module, so a change here that skips the
 * script fails CI rather than shipping a half-updated logo.
 *
 * If the incoming artwork is a single path or a different structure, keep the
 * shape of this module — an array of `{ d, fill?, stroke? }` — rather than
 * special-casing one drawing. The point is that there is exactly one answer to
 * "what does the mark look like?".
 */

/** Amber badge and the mark drawn on it. Not raw hex in components — see below. */
export const MARK_COLORS = {
  /** Matches `brand` in tailwind.config.ts. The badge fill. */
  badge: "#FDBF2D",
  /** The shield body. */
  ink: "#000000",
  /** The check, knocked out of the shield in the badge colour. */
  knockout: "#FDBF2D",
} as const;

/** Corner radius on a 48×48 viewBox. */
export const MARK_RADIUS = 12;
export const MARK_VIEWBOX = 48;

export type MarkPath = {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
};

/**
 * Drawn on a 48×48 grid, badge included, so one array describes the whole mark.
 *
 * The badge is a `rect` rather than a path and is emitted separately — see
 * `markSvg` — because a maskable variant has to scale the *contents* inside a
 * safe area while the badge keeps bleeding to the edge.
 */
export const MARK_PATHS: readonly MarkPath[] = [
  {
    d: "M24 9.5 35 14v9c0 7.5-4.7 12.6-11 15-6.3-2.4-11-7.5-11-15v-9l11-4.5z",
    fill: MARK_COLORS.ink,
  },
  {
    d: "m18.2 24.2 4 4 7.6-8.4",
    stroke: MARK_COLORS.knockout,
    strokeWidth: 3.2,
  },
] as const;

/** Rounded so a committed asset never carries float noise like `4.799999999999999`. */
function inset(scale: number, v: number): number {
  return Math.round((((1 - scale) * v) / 2) * 1000) / 1000;
}

function pathAttrs(p: MarkPath): string {
  const bits = [`d="${p.d}"`];
  if (p.fill) bits.push(`fill="${p.fill}"`);
  if (p.stroke) {
    bits.push(
      `stroke="${p.stroke}"`,
      `stroke-width="${p.strokeWidth ?? 1}"`,
      'fill="none"',
      'stroke-linecap="round"',
      'stroke-linejoin="round"'
    );
  }
  return bits.join(" ");
}

/**
 * The complete mark as an SVG string.
 *
 * `safeAreaScale` shrinks the drawing inside the badge without shrinking the
 * badge — that is what a **maskable** icon needs. Android crops a maskable icon
 * to a circle or squircle inside roughly the middle 80%, so a mark that bleeds
 * to the edge loses its corners. The default (1) is the plain icon; the maskable
 * variant passes 0.8 and keeps every part of the drawing inside the crop.
 */
export function markSvg({ safeAreaScale = 1 }: { safeAreaScale?: number } = {}): string {
  const v = MARK_VIEWBOX;
  const paths = MARK_PATHS.map((p) => `  <path ${pathAttrs(p)}/>`).join("\n");
  const inner =
    safeAreaScale === 1
      ? paths
      : `  <g transform="translate(${inset(safeAreaScale, v)} ${inset(
          safeAreaScale,
          v
        )}) scale(${safeAreaScale})">\n  ${paths.split("\n").join("\n  ")}\n  </g>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v} ${v}">`,
    `  <rect x="0" y="0" width="${v}" height="${v}" rx="${MARK_RADIUS}" fill="${MARK_COLORS.badge}"/>`,
    inner,
    "</svg>",
    "",
  ].join("\n");
}

/** For `next/og`, which renders an `<img>` rather than raw SVG elements. */
export function markDataUri(opts?: { safeAreaScale?: number }): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(markSvg(opts))}`;
}
