import Link from "next/link";
import {
  Body,
  HeadingLg,
  HeadingMd,
  Page,
  PrimaryButtonLink,
  SecondaryButtonLink,
} from "@/components/ui/claude";
import { Logomark } from "@/components/ui/icons";
import { PwaInstallButton } from "@/components/pwa-install-button";

export const metadata = {
  title: "Install Maanta",
  description: "Install the Maanta app on your phone for faster access to deals.",
};

export default function DownloadPage() {
  return (
    <Page className="min-h-dvh bg-paper px-5 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-card bg-brand shadow-card">
            <Logomark className="h-12 w-12" />
          </div>
          <HeadingLg>Install Maanta on your phone</HeadingLg>
          <Body className="mt-2">
            Work faster with deals, claims, and redemptions — right from your home screen.
          </Body>
        </div>

        <div className="mb-6 space-y-4 rounded-card border border-line bg-white p-6 shadow-card">
          <HeadingMd as="h2">Add to home screen</HeadingMd>
          <Body className="text-sm">
            When your browser shows an install prompt, tap <strong>Install</strong> or{" "}
            <strong>Add to Home Screen</strong>. After installing, open Maanta from your
            home screen — you&apos;ll land on the right dashboard for your account.
          </Body>
          <PwaInstallButton />
          <p
            id="pwa-install-hint"
            className="rounded-card bg-cream px-4 py-3 text-sm text-muted"
          >
            Install prompt appears on supported browsers when you visit Maanta over HTTPS.
          </p>
        </div>

        <div className="mb-6 space-y-5 rounded-card border border-line bg-white p-6 shadow-card">
          <HeadingMd as="h2">Manual install</HeadingMd>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">iPhone / iPad (Safari)</h3>
            <ol className="list-inside list-decimal space-y-1 text-sm text-muted">
              <li>Open this page in Safari.</li>
              <li>Tap the Share button.</li>
              <li>Choose &quot;Add to Home Screen&quot;, then Add.</li>
            </ol>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Android (Chrome)</h3>
            <ol className="list-inside list-decimal space-y-1 text-sm text-muted">
              <li>Open this page in Chrome.</li>
              <li>Tap the menu (⋮), then &quot;Install app&quot; or &quot;Add to Home screen&quot;.</li>
              <li>Confirm install.</li>
            </ol>
          </section>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <PrimaryButtonLink href="/login?next=/app-bootstrap" full>
            Sign in
          </PrimaryButtonLink>
          <SecondaryButtonLink href="/help/phone-login" full>
            Phone login help
          </SecondaryButtonLink>
        </div>

        <p className="mt-6 text-center text-xs text-faint">
          Already signed in?{" "}
          <Link href="/app-bootstrap" className="font-semibold text-ink underline">
            Open your dashboard
          </Link>
        </p>
      </div>
    </Page>
  );
}
