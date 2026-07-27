import Link from "next/link";
import {
  Body,
  HeadingLg,
  HeadingMd,
  Page,
  PrimaryButtonLink,
  Section,
} from "@/components/ui/claude";

export const metadata = {
  title: "Phone login — Maanta help",
  description:
    "How to sign in to Maanta with your phone number anywhere in the world using E.164 format and SMS OTP.",
};

const EXAMPLES = [
  { country: "United Kingdom", e164: "+447912345678", local: "07912 345678" },
  { country: "Norway", e164: "+4791234567", local: "912 34 567" },
  { country: "Kenya", e164: "+254712345678", local: "0712 345 678" },
  { country: "Uganda", e164: "+256712345678", local: "0712 345678" },
] as const;

export default function PhoneLoginHelpPage() {
  return (
    <Page className="min-h-dvh bg-stone">
      <Section title="Phone login" className="bg-white">
        <HeadingLg className="mt-2">Sign in from anywhere</HeadingLg>
        <Body className="mt-3 max-w-prose text-secondary">
          Maanta uses international phone numbers in{" "}
          <strong className="font-semibold text-ink">E.164 format</strong>: a plus sign,
          country code, and your local number without the leading zero. You&apos;ll receive a
          one-time code by SMS to verify it&apos;s you.
        </Body>
        <Body className="mt-3 max-w-prose text-secondary">
          Enter your phone number in international format (e.g. +44…, +47…, +254…). After
          OTP success, Maanta routes you through{" "}
          <Link href="/app-bootstrap" className="font-semibold text-ink underline">
            /app-bootstrap
          </Link>{" "}
          to the right console for shoppers, merchants, staff, agents, and founders — no
          assumption about which country you&apos;re in.
        </Body>
      </Section>

      <Section title="Examples" className="border-t border-line bg-white">
        <div className="mt-4 space-y-3">
          {EXAMPLES.map((row) => (
            <div
              key={row.country}
              className="rounded-card border border-line bg-stone px-4 py-3"
            >
              <HeadingMd as="h3" className="text-base">
                {row.country}
              </HeadingMd>
              <Body className="mt-1 font-mono text-sm text-ink">{row.e164}</Body>
              <Body className="mt-0.5 text-xs text-muted">
                Local format you might type: {row.local}
              </Body>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Claiming deals" className="border-t border-line bg-white">
        <Body className="mt-2 max-w-prose text-secondary">
          Browsing deals does not require a phone. When you claim a deal, Maanta sends a
          second OTP to your verified number — the same E.164 identity used at login.
        </Body>
      </Section>

      <Section title="Rollout" className="border-t border-line bg-white">
        <Body className="mt-2 max-w-prose text-secondary">
          Node 0 (BBS Mall) launches with heavy testing in Kenya, Norway, the UK, and
          Uganda. The same phone auth infrastructure scales nationwide in Kenya and to new
          countries within 6–12 months without rewriting the app (see{" "}
          <code className="text-xs">docs/ops/global-rollout.md</code> in the repo).
        </Body>
        <div className="mt-6">
          <PrimaryButtonLink href="/login" full>
            Sign in
          </PrimaryButtonLink>
        </div>
      </Section>
    </Page>
  );
}
