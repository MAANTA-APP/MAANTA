import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter, JetBrains_Mono } from "next/font/google";
import { AuthProviders } from "@/components/auth/auth-providers";
import { PostHogClientProvider } from "@/components/posthog-provider";
import "./globals.css";

// Claude-calm shopper type: DM Sans for UI hierarchy; Inter kept as fallback
// variable for any legacy surfaces. JetBrains Mono for codes / tabular figures.
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/**
 * `metadataBase` makes every relative OG and canonical URL in a child page
 * resolve to an absolute one. Without it Next emits relative OG URLs, which
 * most scrapers — WhatsApp in particular — will not follow, and WhatsApp is how
 * these pages actually get shared in this market.
 */
const SITE_ORIGIN = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.maanta.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "Maanta — The mall, made live.",
    // Child pages set their own full title; this only applies to pages that
    // provide a bare string and want the brand appended.
    template: "%s",
  },
  description:
    "Discover, claim and redeem live mall deals. Now live at BBS Mall, Eastleigh.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    siteName: "MAANTA",
    locale: "en_KE",
    url: SITE_ORIGIN,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FDBF2D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProviders>
      <html lang="en">
        <body
          className={`${dmSans.variable} ${inter.variable} ${jetbrainsMono.variable} bg-white text-ink antialiased`}
        >
          <PostHogClientProvider>{children}</PostHogClientProvider>
        </body>
      </html>
    </AuthProviders>
  );
}
