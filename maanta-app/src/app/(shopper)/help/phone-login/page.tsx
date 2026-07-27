import Link from "next/link";
import {
  Body,
  HeadingLg,
  Page,
  Section,
} from "@/components/ui/claude";
import { ButtonLink } from "@/components/ui/button";

/** Phone / OTP sign-in help for testers (Clerk launch + email OTP dev). */
export default function PhoneLoginHelpPage() {
  return (
    <Page className="px-0 pt-4">
      <div className="px-4">
        <Link
          href="/download"
          className="mb-4 inline-flex text-sm font-semibold text-ink underline"
        >
          ← Back to install
        </Link>
        <HeadingLg className="mt-4">Phone login help</HeadingLg>
        <Body className="mt-1">
          How to sign in with your phone number or email on Maanta.
        </Body>
      </div>

      <Section className="mt-6 space-y-4">
        <details
          open
          className="rounded-card border border-line bg-white px-4 py-3.5 shadow-card"
        >
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Sign in with email (rehearsal / dev)
          </summary>
          <p className="mt-2 text-sm text-muted">
            Open <strong>/login</strong>, enter your @maanta.app test email, and complete the
            one-time code sent to your inbox. After sign-in you are routed via{" "}
            <strong>/app-bootstrap</strong> to the dashboard for your role.
          </p>
        </details>

        <details className="rounded-card border border-line bg-white px-4 py-3.5 shadow-card">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Sign in with phone (Clerk launch)
          </summary>
          <p className="mt-2 text-sm text-muted">
            At launch, <strong>/login</strong> supports phone OTP via Clerk once SMS is
            configured in the Clerk dashboard. Use the phone number on your test account
            (E.164 format, e.g. +254700000020).
          </p>
        </details>

        <details className="rounded-card border border-line bg-white px-4 py-3.5 shadow-card">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Install the app first
          </summary>
          <p className="mt-2 text-sm text-muted">
            Visit <strong>/download</strong> for install instructions. The installed app
            opens at <strong>/app-bootstrap</strong> so merchants, shoppers, and staff land on
            the right surface.
          </p>
        </details>

        <ButtonLink href="/download" variant="primary" full>
          Go to install page
        </ButtonLink>
        <ButtonLink href="/login?next=/app-bootstrap" variant="ghost" full>
          Sign in
        </ButtonLink>
      </Section>
    </Page>
  );
}
