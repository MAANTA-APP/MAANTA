import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter, JetBrains_Mono } from "next/font/google";
import { PostHogClientProvider } from "@/components/posthog-provider";
import { DEMO_MODE } from "@/lib/marketing/demo";
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
  // Same reasoning as OG_STATUS_LINE: this is the search-result snippet, shown
  // before the visitor reaches the page carrying "MAANTA is not yet trading".
  // A description that says "now live" while the site says pre-launch is a
  // contradiction resolved in favour of whichever surface the reader saw first.
  description: DEMO_MODE
    ? "Discover, claim and redeem live mall deals. Launching at BBS Mall, Eastleigh."
    : "Discover, claim and redeem live mall deals. Now live at BBS Mall, Eastleigh.",
  manifest: "/manifest.webmanifest",
  // An explicit `icons` object OVERRIDES Next's file-convention discovery, so
  // `src/app/apple-icon.tsx` generates its PNG but never gets linked unless it is
  // named here too. That is exactly how the iOS Add to Home Screen icon went
  // missing: the route existed in the build output and the HTML carried only
  // `rel="icon"`, which iOS Safari ignores for the Home Screen.
  icons: { icon: "/icon.svg", apple: "/apple-icon" },
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
    /*
      No auth provider here, deliberately.
      Clerk is mounted per authenticated shell via `AppProviders`, so a marketing
      visitor never downloads the auth SDK for a page that has no login on it.
      `PostHogClientProvider` stays — anonymous analytics runs everywhere and
      carries no Clerk dependency.
    */
    <>
      <html lang="en">
        <body
          className={`${dmSans.variable} ${inter.variable} ${jetbrainsMono.variable} bg-white text-ink antialiased`}
        >
          <PostHogClientProvider>{children}</PostHogClientProvider>
        </body>
      </html>
    </>
  );
}
