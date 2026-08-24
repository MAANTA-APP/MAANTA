import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Maanta Frozen UI (Pass 2) design tokens — from maanta-design-brief §2.
        // Never write raw hex into components; use these names.
        brand: {
          DEFAULT: "#FDBF2D", // --action-primary-bg · the one amber action. Fill/border only.
          light: "#FDD576", // amber tint (merchant/admin legacy chips)
          tint: "#FFF7E0", // pale amber wash (merchant/admin legacy)
        },
        ink: {
          DEFAULT: "#111111", // --text-primary / --text-money · 18.88:1 on white
          soft: "#000000", // pure black — CTA labels (12.67:1 on amber), emphasis borders
          900: "#141414", // --bg-ink-900 · merchant failure takeover (failure is dark, not red)
        },
        paper: "#FAFAF8", // --bg-app · shopper page background
        cream: {
          DEFAULT: "#FAFAF8", // repointed to paper — legacy washes / image placeholders
          dark: "#F1F1F1", // --bg-surface-2 · disabled fill
        },
        rust: "#9A4A0C", // --status-warning · warnings, urgency. NEVER yellow (L6)
        flame: {
          DEFAULT: "#8C1D18", // error red — blocked / failed / arrears text + border
          tint: "#FBEDEC", // pale error wash
        },
        verified: {
          DEFAULT: "#0A5C34", // --status-success-solid · success. White on it = 8.10:1
          tint: "#E8F1EC",
        },
        line: "#E5E2DA", // hairline card borders
        secondary: "#3D3D3D", // --text-secondary · 10.86:1 — struck prices, money context
        muted: "#5C5C5C", // --text-tertiary · 6.40:1 — labels, non-money
        faint: "#6B6B6B", // --text-muted · 5.33:1 — placeholders. NEVER money, NEVER code
        // Claude-calm surfaces (shopper polish) — soft stone, not cream/terracotta.
        stone: {
          DEFAULT: "#F4F2ED", // page wash behind cards
          soft: "#EDEAE3",
          ink: "#1A1A18", // high-contrast body on stone
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      // One easing for every transition in the app.
      //
      // `globals.css` has defined `--ease-standard` since the Frozen UI pass,
      // with the instruction "Keep new transitions on this so overlays,
      // presses, and fades feel like one system." Two call sites did. The other
      // 42 used a bare `transition`, which resolves to Tailwind's default
      // `cubic-bezier(0.4, 0, 0.2, 1)` — an ease-in-out that *starts slow*. On a
      // press that reads as lag: the button lifts late rather than answering the
      // finger. The house curve decelerates instead (fast out, gentle settle),
      // which is what makes a control feel answered rather than animated.
      //
      // Wiring it as DEFAULT rather than fixing 42 call sites is deliberate: a
      // rule each author has to remember is a rule that drifts, and this one
      // already had. The literal fallback covers the case where the custom
      // property is missing (an isolated render, a shadow root) — without it an
      // undefined `var()` makes the declaration invalid and silently reverts to
      // `ease`, which is the exact defect this replaces.
      transitionTimingFunction: {
        DEFAULT: "var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1))",
      },
      borderRadius: {
        card: "1.25rem", // Claude-soft card
        sheet: "1.5rem", // bottom sheets / phone panels
        pill: "9999px",
      },
      boxShadow: {
        sheet: "0 -8px 30px rgba(0,0,0,0.12)",
        modal: "0 12px 40px rgba(0,0,0,0.18)",
        card: "0 1px 2px rgba(26,26,24,0.04), 0 8px 24px rgba(26,26,24,0.06)",
      },
      spacing: {
        section: "1.75rem",
        rail: "1.25rem",
      },
      maxWidth: {
        mobile: "430px",
      },
      keyframes: {
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // R3 — the only amber liveness pulse. Breathes the claimed-code border.
        r3: {
          "0%, 100%": { borderColor: "#FDBF2D" },
          "50%": { borderColor: "#FBE7AE" },
        },
        // A code digit landing in an OTP cell — a crisp settle, no colour.
        "otp-pop": {
          from: { transform: "scale(0.7)", opacity: "0.4" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        // Marketing entrance. Deliberately small (8px) and opacity-only beyond
        // that: a long travel reads as a template, and anything applied to the
        // LCP element delays it. Never put this on an <h1>.
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "sheet-up": "sheet-up 0.25s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        r3: "r3 2s ease-in-out infinite",
        "otp-pop": "otp-pop 0.15s ease-out",
        // `both` so the element is not visible at its untransformed position for
        // a frame before the animation starts. globals.css collapses the
        // duration under prefers-reduced-motion, which leaves the end state.
        "fade-in-up": "fade-in-up 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
