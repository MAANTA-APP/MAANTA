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

export const metadata: Metadata = {
  title: "Maanta — The mall, made live.",
  description:
    "Discover, claim and redeem live mall deals. Now live at BBS Mall, Eastleigh.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
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
