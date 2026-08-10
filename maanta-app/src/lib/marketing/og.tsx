import { ImageResponse } from "next/og";
import { NODE_STATUS_LINE, SHOW_LIVE_INDICATOR } from "@/lib/marketing/live-claims";

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

/**
 * The status line across the foot of every OG image.
 *
 * `demo-mode-spec.md` §2a sanctions "Live at BBS Mall, Eastleigh · Nairobi" as
 * the production fallback — but it sanctions it as the **`#hero` status line on
 * `/mall-operators`**, a page that carries `PrelaunchNotice` in its footer:
 * "Pre-launch demonstration. MAANTA is not yet trading."
 *
 * An OG image has no footer. It is what a person sees in a WhatsApp forward or a
 * search result **before** they open anything, so it is the one surface where the
 * disclosure provably cannot follow the claim — and in this market WhatsApp is
 * how these pages actually get shared. Asserting "Live at" there, while the site
 * itself says the company is not yet trading, is a contradiction that reaches
 * more people than the page it contradicts.
 *
 * So while `DEMO_MODE` holds, the line states the location and makes no claim
 * about trading. Flipping `DEMO_MODE` to false at launch restores "Live at".
 *
 * Raised independently by two reviewers on PR #153 (CodeRabbit; the Cursor audit
 * as "'Live at BBS Mall' vs prelaunch footer"). Dismissed once on the grounds
 * that the string is spec-sanctioned, which checked the string and not the
 * surface it renders on.
 *
 * **Generalised 2026-08-10 (the D87 ruling).** The reasoning above was right and
 * was applied in exactly one place, so the site shipped this carefully hedged
 * line at the foot of an image while the footer of every page asserted "Live at
 * BBS Mall" underneath it. The constant now re-exports the site-wide value from
 * `lib/marketing/live-claims.ts`, which puts all twenty-one trading claims under
 * one flag. The name is kept because callers and `prelaunch-consistency.test.ts`
 * refer to it.
 */
export const OG_STATUS_LINE = NODE_STATUS_LINE;

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
          {/*
            The amber dot is a live-status indicator, so it is gated with the
            words it belongs to. Keeping it beside a bare place name would carry
            the trading claim in colour alone — and an OG image is the one
            surface where nobody can click through to find out otherwise.
          */}
          {SHOW_LIVE_INDICATOR ? (
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: BRAND,
                display: "flex",
              }}
            />
          ) : null}
          {OG_STATUS_LINE}
        </div>
      </div>
    ),
    OG_SIZE
  );
}
