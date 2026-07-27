import Link from "next/link";
import { DownloadClient } from "./download-client";
import { Logomark } from "@/components/ui/icons";
import {
  Body,
  HeadingLg,
  HeadingMd,
  Meta,
  Page,
  PrimaryButtonLink,
  Section,
} from "@/components/ui/claude";

export const metadata = {
  title: "Install Maanta — Add to your phone",
  description:
    "Install the Maanta web app on your phone. One app for shoppers, merchants, agents, and founders.",
};

const ROLE_ROWS = [
  {
    title: "For shoppers",
    body: "Browse live deals, see expiry and grace, save your favourite shops, and redeem in seconds — without downloading a heavy app.",
  },
  {
    title: "For merchants & staff",
    body: "Manage your deals, redemptions, and payouts from one place. Install the app once per device and log in with your merchant or staff email.",
  },
  {
    title: "For admin, agents & founders",
    body: "Get a dedicated Maanta icon for ops: approve merchants, track leads, resolve disputes, and watch KPIs without opening a desktop browser.",
  },
] as const;

export default function DownloadPage() {
  return (
    <Page className="min-h-dvh bg-stone">
      <header className="border-b border-line bg-white px-5 py-4">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <Logomark className="h-8 w-8" />
          Maanta
        </Link>
      </header>

      <section className="border-b border-line bg-brand px-5 py-10 text-center">
        <Meta as="p" className="font-semibold uppercase tracking-[0.12em] text-black/70">
          Install Maanta on your phone to work faster.
        </Meta>
        <HeadingLg className="mx-auto mt-3 max-w-lg text-ink">
          Install the Maanta app. Work faster on the ground.
        </HeadingLg>
        <Body className="mx-auto mt-3 max-w-md text-secondary">
          One app for shoppers, merchants, agents, and founders. Browse deals, redeem
          in-store, manage shops, and run operations — all from your home screen.
        </Body>
        <div className="mt-8 flex flex-col items-center gap-3">
          <DownloadClient />
          <PrimaryButtonLink href="/login" size="md" className="!bg-ink !text-white">
            Log in with email OTP
          </PrimaryButtonLink>
        </div>
        <Meta as="p" className="mx-auto mt-4 max-w-sm text-secondary">
          Maanta is a lightweight web app. No Play Store or App Store needed — just add
          it to your home screen and log in with your email OTP.
        </Meta>
      </section>

      <Section title="Built for every role on the ground" className="bg-white">
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {ROLE_ROWS.map((row) => (
            <div key={row.title} className="rounded-card border border-line bg-stone p-4">
              <HeadingMd as="h3" className="text-base">
                {row.title}
              </HeadingMd>
              <Body className="mt-2 text-sm text-secondary">{row.body}</Body>
            </div>
          ))}
        </div>
      </Section>

      <Section title="How to install" className="border-t border-line bg-white">
        <DownloadClient showInstructions />
      </Section>

      <footer className="border-t border-line px-5 py-8 text-center">
        <Body className="text-sm text-muted">
          Already installed?{" "}
          <Link href="/login" className="font-semibold text-ink underline">
            Sign in
          </Link>{" "}
          — we&apos;ll route you to the right console for your role.
        </Body>
      </footer>
    </Page>
  );
}
