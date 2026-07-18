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
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "1rem", // standard card
        sheet: "1.5rem", // bottom sheets / phone panels
      },
      boxShadow: {
        sheet: "0 -8px 30px rgba(0,0,0,0.12)",
        modal: "0 12px 40px rgba(0,0,0,0.18)",
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
      },
      animation: {
        "sheet-up": "sheet-up 0.25s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        r3: "r3 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
