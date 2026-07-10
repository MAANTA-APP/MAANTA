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
        // Maanta frozen design tokens — sampled from design/Maanta_Wireframe_System.pdf
        brand: {
          DEFAULT: "#FDBF2D", // primary yellow (buttons, accents, code display)
          light: "#FDD576", // yellow tint (progress, chips)
          tint: "#FFF7E0", // pale yellow wash
        },
        ink: {
          DEFAULT: "#000000", // black surfaces / nav / emphasis borders
          soft: "#111111",
        },
        cream: {
          DEFAULT: "#F5F2EB", // warm off-white card fill
          dark: "#EDE9DF",
        },
        flame: {
          DEFAULT: "#E8431F", // FLASH / destructive / near-expiry countdown
          tint: "#FCEBE7", // pale red wash (warning banners)
        },
        verified: {
          DEFAULT: "#1F8A3E", // success green (✓ Verified, LIVE)
          tint: "#E8F4EC",
        },
        line: "#EBEBEB", // hairline borders
        muted: "#666666", // secondary text
        faint: "#9E9C98", // tertiary text on cream
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
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
      },
      animation: {
        "sheet-up": "sheet-up 0.25s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
