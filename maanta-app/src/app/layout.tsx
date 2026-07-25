import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { PostHogClientProvider } from "@/components/posthog-provider";
import "./globals.css";

// Frozen UI type system (maanta-design-brief §2): Inter for everything,
// JetBrains Mono for codes / tabular figures (slashed zero enabled in globals).
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
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <html lang="en">
        <body
          className={`${inter.variable} ${jetbrainsMono.variable} bg-white text-ink antialiased`}
        >
          <PostHogClientProvider>{children}</PostHogClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
