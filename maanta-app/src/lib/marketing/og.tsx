import { ImageResponse } from "next/og";

/**
 * Shared Open Graph image template.
 *
 * Generated with `next/og` rather than authored as files, so a headline can never
 * drift from the page it belongs to — the OG text and the page copy come from the
 * same deck, and the image is rebuilt whenever the route is.
 *
 * Deliberately typographic. There is no photograph of the mall, no product
 * screenshot, and no stock imagery — the design notes ban stock, and a screenshot
 * of demo data would be exactly the kind of thing risk R1 exists to prevent. Type
 * on a near-white ground, with one amber rule, reads as considered at thumbnail
 * size and cannot go stale.
 *
 * Colours are the frozen tokens as literals: this renders in the edge image
 * runtime, which has no Tailwind and no CSS variables.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const INK = "#111111";
const SECONDARY = "#3D3D3D";
const PAPER = "#FAFAF8";
const BRAND = "#FDBF2D";
const LINE = "#E5E2DA";

export function ogImage({
  eyebrow,
  headline,
  subline,
}: {
  /** Audience label, e.g. "For merchants". */
  eyebrow?: string;
  headline: string;
  subline?: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: BRAND,
              display: "flex",
            }}
          />
          <div style={{ fontSize: 34, fontWeight: 800, color: INK, letterSpacing: -0.5 }}>
            MAANTA
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {eyebrow ? (
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: SECONDARY,
                textTransform: "uppercase",
                letterSpacing: 2,
                marginBottom: 20,
                display: "flex",
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: INK,
              lineHeight: 1.1,
              letterSpacing: -2,
              display: "flex",
            }}
          >
            {headline}
          </div>
          {subline ? (
            <div
              style={{
                fontSize: 30,
                color: SECONDARY,
                lineHeight: 1.35,
                marginTop: 24,
                display: "flex",
              }}
            >
              {subline}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            borderTop: `1px solid ${LINE}`,
            paddingTop: 28,
            fontSize: 24,
            color: SECONDARY,
          }}
        >
          <div
            style={{ width: 12, height: 12, borderRadius: 6, background: BRAND, display: "flex" }}
          />
          Live at BBS Mall, Eastleigh · Nairobi
        </div>
      </div>
    ),
    OG_SIZE
  );
}
