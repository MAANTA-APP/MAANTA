import { ImageResponse } from "next/og";
import { FACTS } from "@/lib/marketing/facts";
import { NODE_STATUS_LINE, NODE_PRESENCE_LEAD } from "@/lib/marketing/live-claims";
import { SAMPLE_DEALS } from "@/lib/marketing/sample-deals";
import { OG_SIZE, ogImage } from "@/lib/marketing/og";

/**
 * The social and OG image kit — design board 4 of 4, built from the brief.
 *
 * Board 4 was never exported from Claude Design; the bundle ends at board 3. The
 * brief asked for "reusable specifications for Instagram/TikTok profile imagery,
 * LinkedIn/Facebook covers, YouTube channel art, OG cards and deal/social
 * templates", and the founder chose "a spec sheet with rendered examples". This
 * module is that spec sheet's source of truth: every asset is declared once —
 * dimensions, safe area, what it is for — and rendered by `next/og` on request,
 * so the images can never drift from the copy and facts the site itself uses.
 *
 * ## Rules, inherited from the OG template
 *
 * - **Typographic, no photographs.** No stock, no product screenshots, no demo
 *   data dressed as real. Type on the brand's own grounds.
 * - **Nothing invented without saying so.** The deal templates draw
 *   `SAMPLE_DEALS` and print "Example — not a real offer" on the image itself,
 *   because a social card has no footer for a disclosure to follow it into.
 * - **No trading claim while pre-launch.** The foot of every card carries
 *   `NODE_STATUS_LINE`, which flips with `DEMO_MODE` like every other claim.
 * - **Colours are the frozen tokens as literals**: this renders in the edge
 *   image runtime, which has no Tailwind.
 * - **No free text from the URL.** Every variable is a closed index (which sample
 *   deal), never a string — a brand-stamped image with attacker-chosen words is
 *   what an open `?headline=` parameter would be.
 *
 * Platform dimensions are the published values at the time of writing
 * (2026-09-05). Platforms move these; the spec sheet says to check before a
 * mass upload, and the numbers live here, in one place, when they do.
 */

const INK = "#111111";
const SECONDARY = "#3D3D3D";
const MUTED = "#5C5C5C";
const PAPER = "#FAFAF8";
const STONE = "#F4F2ED";
const BRAND = "#FDBF2D";
const LINE = "#E5E2DA";

export type SafeArea = { x: number; y: number; width: number; height: number; why: string };

export type KitAsset = {
  id: string;
  name: string;
  /** Where it is uploaded. */
  platform: string;
  width: number;
  height: number;
  /** The region the platform is guaranteed to show, when it crops. */
  safe: SafeArea | null;
  /** One sentence: what this asset is for. */
  use: string;
  notes: readonly string[];
  /** Deal templates accept a sample-deal index; everything else ignores it. */
  variants?: { param: "deal"; count: number };
  render: (ctx: RenderContext) => ImageResponse;
};

export type RenderContext = {
  /** The request origin, for the lockup PNGs. */
  origin: string;
  /** Host shown on waitlist cards ("maanta.app"). */
  host: string;
  /** Which sample deal, for the deal templates. */
  deal: number;
};

const lockup = (origin: string, dark: boolean) =>
  `${origin}/brand/maanta-lockup-horizontal${dark ? "-white" : ""}.png`;
const icon = (origin: string) => `${origin}/brand/maanta-icon.png`;

/** The one-line foot every card carries. */
function Foot({ dark = false, size = 26 }: { dark?: boolean; size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        borderTop: `1px solid ${dark ? "rgba(255,255,255,0.18)" : LINE}`,
        paddingTop: 22,
        fontSize: size,
        color: dark ? "rgba(255,255,255,0.7)" : SECONDARY,
      }}
    >
      {NODE_STATUS_LINE}
    </div>
  );
}

function ExampleBadge({ size = 20 }: { size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        border: `1px solid ${LINE}`,
        background: "#FFFFFF",
        color: MUTED,
        borderRadius: 6,
        padding: `${size * 0.35}px ${size * 0.6}px`,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: "uppercase",
      }}
    >
      Example — not a real offer
    </div>
  );
}

const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

/** A deal card: the format the feed will show, drawn from the shared sample list. */
function DealCard({ deal, scale }: { deal: number; scale: number }) {
  const d = SAMPLE_DEALS[deal] ?? SAMPLE_DEALS[0];
  const s = (n: number) => Math.round(n * scale);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#FFFFFF",
        borderRadius: s(28),
        overflow: "hidden",
        boxShadow: "0 8px 24px rgba(26,26,24,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          height: s(220),
          background: STONE,
          alignItems: "flex-start",
          padding: s(20),
        }}
      >
        <ExampleBadge size={s(18)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", padding: s(28) }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: s(20), color: MUTED }}>
          <div style={{ display: "flex" }}>Ground floor · {d.away}</div>
          <div style={{ display: "flex" }}>Ends soon</div>
        </div>
        <div style={{ display: "flex", fontSize: s(40), fontWeight: 800, color: INK, marginTop: s(10), letterSpacing: -1 }}>
          {d.deal}
        </div>
        <div style={{ display: "flex", fontSize: s(24), color: SECONDARY, marginTop: s(4) }}>{d.shop}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: s(14), marginTop: s(18) }}>
          <div style={{ display: "flex", fontSize: s(48), fontWeight: 800, color: INK, letterSpacing: -1 }}>
            {kes(d.now)}
          </div>
          <div style={{ display: "flex", fontSize: s(26), color: SECONDARY, textDecoration: "line-through" }}>
            {kes(d.was)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* eslint-disable @next/next/no-img-element */

function profileSquare({ origin }: RenderContext) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND,
        }}
      >
        {/* The supplied icon, centred well inside the circle every platform
            crops to. Its own baked-in rounded corners vanish on the amber. */}
        <img src={icon(origin)} width={640} height={640} alt="" />
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}

function coverLight({ origin }: RenderContext, size: { width: number; height: number }, safe: SafeArea | null) {
  const s = size.height / 396;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: PAPER,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 18 * s,
            marginLeft: safe ? safe.x + 40 * s : 80 * s,
            marginRight: 80 * s,
          }}
        >
          <img src={lockup(origin, false)} height={64 * s} width={261 * s} alt="" />
          <div style={{ display: "flex", fontSize: 40 * s, fontWeight: 800, color: INK, letterSpacing: -1, lineHeight: 1.1, maxWidth: 900 * s }}>
            Mall deals you claim on your phone and redeem at the counter.
          </div>
          <div style={{ display: "flex", fontSize: 24 * s, color: SECONDARY }}>{NODE_STATUS_LINE}</div>
        </div>
      </div>
    ),
    size
  );
}

function coverDark({ origin }: RenderContext, size: { width: number; height: number }, safe: SafeArea | null) {
  const s = size.height / 191;
  // The headline must wrap inside what is left of the frame after the safe-area
  // inset, the lockup and the gap — on the 1128×191 company banner that is
  // about 460px, and an unconstrained line clipped at the right edge
  // (readiness sweep, 2026-09-05). The column width is derived from the frame
  // so every size this template renders at gets the same protection.
  const marginLeft = safe ? safe.x + 24 * s : 48 * s;
  const marginRight = 48 * s;
  const lockupWidth = 180 * s;
  const gap = 36 * s;
  const textWidth = size.width - marginLeft - lockupWidth - gap - marginRight;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: INK, fontFamily: "sans-serif" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap,
            marginLeft,
            marginRight,
          }}
        >
          <img src={lockup(origin, true)} height={44 * s} width={lockupWidth} alt="" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 * s, maxWidth: textWidth }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                fontSize: 26 * s,
                lineHeight: 1.15,
                fontWeight: 800,
                color: "#FFFFFF",
                letterSpacing: -0.5,
              }}
            >
              Mall deals you claim on your phone and redeem at the counter.
            </div>
            <div style={{ display: "flex", fontSize: 16 * s, color: "rgba(255,255,255,0.7)" }}>{NODE_STATUS_LINE}</div>
          </div>
        </div>
      </div>
    ),
    size
  );
}

function youtubeChannelArt({ origin }: RenderContext) {
  // 2560×1440, of which only the central 1546×423 is guaranteed on every device.
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: INK,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            width: 1546,
            height: 423,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 80px",
          }}
        >
          <img src={lockup(origin, true)} height={96} width={392} alt="" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14 }}>
            <div style={{ display: "flex", fontSize: 48, fontWeight: 800, color: "#FFFFFF", letterSpacing: -1 }}>
              {NODE_PRESENCE_LEAD} {FACTS.launchMall}.
            </div>
            <div style={{ display: "flex", fontSize: 28, color: "rgba(255,255,255,0.7)" }}>{NODE_STATUS_LINE}</div>
          </div>
        </div>
      </div>
    ),
    { width: 2560, height: 1440 }
  );
}

function dealPost(ctx: RenderContext) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: PAPER, padding: 72, fontFamily: "sans-serif" }}>
        <img src={lockup(ctx.origin, false)} height={64} width={261} alt="" />
        <DealCard deal={ctx.deal} scale={1.25} />
        <Foot />
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}

function dealStory(ctx: RenderContext) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: PAPER, padding: "220px 80px 260px", fontFamily: "sans-serif" }}>
        <img src={lockup(ctx.origin, false)} height={72} width={294} alt="" />
        <DealCard deal={ctx.deal} scale={1.35} />
        <Foot size={30} />
      </div>
    ),
    { width: 1080, height: 1920 }
  );
}

function waitlistCard(ctx: RenderContext, size: { width: number; height: number }) {
  const story = size.height > size.width;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: INK, padding: story ? "220px 80px 260px" : 72, fontFamily: "sans-serif" }}>
        <img src={lockup(ctx.origin, true)} height={64} width={261} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", fontSize: story ? 84 : 72, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.05, letterSpacing: -2 }}>
            Be there when Eastleigh&apos;s shops switch on.
          </div>
          <div style={{ display: "flex", fontSize: story ? 36 : 32, color: "rgba(255,255,255,0.72)", lineHeight: 1.35 }}>
            One message when {FACTS.nodeLabel} opens. Nothing else.
          </div>
          <div style={{ display: "flex", alignSelf: "flex-start", background: BRAND, color: "#000000", borderRadius: 999, padding: "22px 40px", fontSize: story ? 36 : 32, fontWeight: 700 }}>
            {ctx.host}/waitlist
          </div>
        </div>
        <Foot dark size={story ? 30 : 26} />
      </div>
    ),
    size
  );
}

const LINKEDIN_COMPANY_SAFE: SafeArea = {
  x: 380, y: 0, width: 748, height: 191,
  why: "The company logo overlaps the bottom-left of the cover on desktop; keep everything right of it.",
};
const LINKEDIN_PERSONAL_SAFE: SafeArea = {
  x: 420, y: 0, width: 1164, height: 396,
  why: "The profile photo overlaps the bottom-left ~400px; keep the lockup and text right of it.",
};
const FACEBOOK_SAFE: SafeArea = {
  x: 90, y: 0, width: 640, height: 312,
  why: "Phones show the centre 640×360 of an 820×312 cover; keep content in the middle.",
};
const YOUTUBE_SAFE: SafeArea = {
  x: 507, y: 508, width: 1546, height: 423,
  why: "TV shows the whole 2560×1440; phones show only this central 1546×423. Everything that matters lives inside it.",
};

export const SOCIAL_KIT: readonly KitAsset[] = [
  {
    id: "profile-square",
    name: "Profile image",
    platform: "Instagram · TikTok · Facebook · LinkedIn · YouTube",
    width: 1080, height: 1080,
    safe: { x: 108, y: 108, width: 864, height: 864, why: "Every platform crops the profile image to a circle. The mark sits inside the middle 80%." },
    use: "The mark on the amber badge, full-bleed. Upload the same file everywhere.",
    notes: ["Square, no baked-in rounding: the platform does the cropping.", "Amber edge to edge, so the circle crop shows no background."],
    render: profileSquare,
  },
  {
    id: "facebook-cover",
    name: "Facebook page cover",
    platform: "Facebook",
    width: 820, height: 312,
    safe: FACEBOOK_SAFE,
    use: "The page cover. Lockup and the one-line promise, centred for the phone crop.",
    notes: ["Facebook re-compresses covers; the flat ground and type survive it.", "Check the phone crop after upload — it is the view most people get."],
    render: (ctx) => coverLight(ctx, { width: 820, height: 312 }, FACEBOOK_SAFE),
  },
  {
    id: "linkedin-company-cover",
    name: "LinkedIn company cover",
    platform: "LinkedIn (company page)",
    width: 1128, height: 191,
    safe: LINKEDIN_COMPANY_SAFE,
    use: "The company page banner, dark, with the white lockup right of where LinkedIn places the logo.",
    notes: ["A short banner: one line, no paragraph.", "Re-check the logo overlap on desktop after upload."],
    render: (ctx) => coverDark(ctx, { width: 1128, height: 191 }, LINKEDIN_COMPANY_SAFE),
  },
  {
    id: "linkedin-personal-cover",
    name: "LinkedIn personal cover",
    platform: "LinkedIn (founder profile)",
    width: 1584, height: 396,
    safe: LINKEDIN_PERSONAL_SAFE,
    use: "For the founder's own profile. Same promise, on the paper ground, right of the photo.",
    notes: ["Keeps the same words as the company banner so the two profiles read as one company."],
    render: (ctx) => coverLight(ctx, { width: 1584, height: 396 }, LINKEDIN_PERSONAL_SAFE),
  },
  {
    id: "youtube-channel-art",
    name: "YouTube channel art",
    platform: "YouTube",
    width: 2560, height: 1440,
    safe: YOUTUBE_SAFE,
    use: "Channel banner. Everything sits inside the 1546×423 the phone shows; the rest is ink.",
    notes: ["Under 6MB as uploaded. This renders well under that.", "The outer area is plain on purpose — it is cropped away on most screens."],
    render: youtubeChannelArt,
  },
  {
    id: "og-default",
    name: "OG card — default",
    platform: "Links shared anywhere (WhatsApp, X, LinkedIn, Slack)",
    width: OG_SIZE.width, height: OG_SIZE.height,
    safe: null,
    use: "The shape every page's own OG image follows. Each indexable route renders its own headline from the same template.",
    notes: ["Per-route cards are generated at /<route>/opengraph-image and listed on the Content & SEO screen.", "The foot carries the pre-launch status line, because a WhatsApp preview has no footer for a disclosure."],
    render: () =>
      ogImage({
        eyebrow: "MAANTA",
        headline: "Mall deals you claim on your phone and redeem at the counter.",
        subline: `${NODE_PRESENCE_LEAD} ${FACTS.launchMall}.`,
      }),
  },
  {
    id: "deal-post",
    name: "Deal template — feed post",
    platform: "Instagram feed · Facebook · LinkedIn",
    width: 1080, height: 1080,
    safe: null,
    use: "A single deal as a square post. Draws a sample deal; every real post will draw a real one from the feed.",
    notes: ["Prints “Example — not a real offer” on the card itself until real deals exist.", "Prices are ink, never amber (frozen rule 6)."],
    variants: { param: "deal", count: SAMPLE_DEALS.length },
    render: dealPost,
  },
  {
    id: "deal-story",
    name: "Deal template — story / reel cover",
    platform: "Instagram stories · TikTok · WhatsApp status",
    width: 1080, height: 1920,
    safe: { x: 0, y: 250, width: 1080, height: 1420, why: "Stories overlay the top 250px and bottom 250px with UI; keep the card between them." },
    use: "The same deal, portrait, with the platform's own overlays kept clear.",
    notes: ["Use as a cover frame for a reel or a status update, not as a replacement for video."],
    variants: { param: "deal", count: SAMPLE_DEALS.length },
    render: dealStory,
  },
  {
    id: "waitlist-post",
    name: "Waitlist card — feed post",
    platform: "Instagram feed · Facebook · LinkedIn · X",
    width: 1080, height: 1080,
    safe: null,
    use: "The one pre-launch post: the promise, and the waitlist address in the one amber pill.",
    notes: ["The address is the site's own host, so a preview build prints its own domain and production prints maanta.app."],
    render: (ctx) => waitlistCard(ctx, { width: 1080, height: 1080 }),
  },
  {
    id: "waitlist-story",
    name: "Waitlist card — story",
    platform: "Instagram stories · TikTok · WhatsApp status",
    width: 1080, height: 1920,
    safe: { x: 0, y: 250, width: 1080, height: 1420, why: "Stories overlay the top and bottom 250px with UI." },
    use: "The same waitlist card, portrait, for stories and status updates.",
    notes: [],
    render: (ctx) => waitlistCard(ctx, { width: 1080, height: 1920 }),
  },
];

export function findKitAsset(id: string): KitAsset | null {
  return SOCIAL_KIT.find((a) => a.id === id) ?? null;
}

/** The sample-deal index from a query value, or 0. Never a string; never out of range. */
export function kitDealIndex(value: string | null, count: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < count ? n : 0;
}
