import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { PostHogClientProvider } from "@/components/posthog-provider";
import { PwaRegistrar } from "@/components/pwa-registrar";
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
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-icon.png",
  },
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
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/login"}
      signUpUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? "/sign-up"}
      signInFallbackRedirectUrl={
        process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL ?? "/app-bootstrap"
      }
      signUpFallbackRedirectUrl={
        process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL ?? "/app-bootstrap"
      }
    >
      <html lang="en">
        <body
          className={`${dmSans.variable} ${inter.variable} ${jetbrainsMono.variable} bg-white text-ink antialiased`}
        >
          <PostHogClientProvider>
            <PwaRegistrar />
            {children}
          </PostHogClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
