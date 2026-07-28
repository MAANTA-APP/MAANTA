"use client";

import { usePwaInstall } from "@/lib/pwa/usePwaInstall";
import {
  Body,
  HeadingLg,
  Meta,
  PrimaryButton,
  PrimaryButtonLink,
  SecondaryButtonLink,
} from "@/components/ui/claude";
import { Logomark } from "@/components/ui/icons";

/** Client CTAs for /download — install when the browser allows it. */
export function DownloadInstallPanel() {
  const { canInstall, install, isStandalone } = usePwaInstall();

  if (isStandalone) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3">
        <Body className="text-muted">Maanta is already on this device.</Body>
        <PrimaryButtonLink href="/app-bootstrap" size="lg">
          Open Maanta
        </PrimaryButtonLink>
      </div>
    );
  }

  return (
    <div className="mt-8 flex w-full max-w-md flex-col items-stretch gap-3">
      {canInstall ? (
        <PrimaryButton
          size="lg"
          full
          onClick={() => {
            void install();
          }}
        >
          Add Maanta to my phone
        </PrimaryButton>
      ) : (
        <div className="rounded-card border border-line bg-white p-5 text-left shadow-card">
          <Body className="font-semibold text-ink">Add to your home screen</Body>
          <ul className="mt-3 space-y-3 text-sm text-muted">
            <li>
              <span className="font-semibold text-ink">Android: </span>
              Open Maanta in Chrome and choose &ldquo;Install app&rdquo; or
              &ldquo;Add to Home screen&rdquo; from the menu.
            </li>
            <li>
              <span className="font-semibold text-ink">iPhone: </span>
              Open Maanta in Safari, tap Share → Add to Home Screen.
            </li>
          </ul>
        </div>
      )}
      <PrimaryButtonLink href="/login" size="lg" className="text-center">
        Sign in with email or phone
      </PrimaryButtonLink>
      <SecondaryButtonLink href="/help" className="text-center text-sm">
        Having trouble signing in?
      </SecondaryButtonLink>
      <Meta as="p" className="text-center text-muted">
        After install, open Maanta from your home screen — we&apos;ll route you
        by role.
      </Meta>
    </div>
  );
}

/** Static hero markup shared with tests (headline + subcopy). */
export function DownloadHeroCopy() {
  return (
    <>
      <Logomark className="mx-auto h-14 w-14" />
      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
        Maanta
      </p>
      <HeadingLg className="mx-auto mt-3 max-w-xl text-ink sm:text-[2.1rem]">
        Install Maanta on your phone to work faster.
      </HeadingLg>
      <Body className="mx-auto mt-4 max-w-md text-muted">
        One app for shoppers, merchants, agents, and founders. Browse deals,
        redeem in-store, manage shops, and run operations from your home screen.
      </Body>
    </>
  );
}
