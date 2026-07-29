import type { Metadata } from "next";
import Link from "next/link";
import {
  Body,
  HeadingLg,
  HeadingMd,
  PrimaryButtonLink,
} from "@/components/ui/claude";
import { IconCheck } from "@/components/ui/icons";
import { formatKes } from "@/lib/ui";

export const metadata: Metadata = {
  title: "For merchants — pay only for verified redemptions | Maanta",
  description:
    "Publish deals to shoppers at BBS Mall and pay KES 30 only when a customer's code is verified at your counter. No listing fee, no percentage cut, no monthly minimum.",
};

/** The frozen success fee. Charged once, at merchant verification. */
const SUCCESS_FEE = 30;
/** Worked example — a mid-range BBS deal, not a special case. */
const EXAMPLE_BEFORE = 500;
const EXAMPLE_AFTER = 400;

const STEPS: [string, string][] = [
  ["Post a deal", "Two minutes on your phone. One standard deal is free."],
  ["A shopper claims it", "They get a 6-digit code. Nothing has cost you anything yet."],
  ["Verify at your counter", "Type the code in. It either verifies or it doesn't."],
  [
    `Pay ${formatKes(SUCCESS_FEE)}`,
    "Only on a verified code. Expired and rejected codes cost nothing.",
  ],
];

/** 12d For merchants — the sell. Signup itself lives at /merchants. */
export default function ForMerchantsPage() {
  return (
    <main className="bg-stone">
      {/* Hero — risk reversal. A Nairobi shopkeeper's first question is what
          this costs, so the fee model answers before they have to ask. */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(253,191,45,0.28),transparent_55%),radial-gradient(ellipse_at_90%_40%,rgba(10,92,52,0.12),transparent_50%),linear-gradient(180deg,#1A1A18_0%,#2A2824_100%)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-16 sm:pt-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
            For merchants
          </p>
          <HeadingLg className="mt-3 max-w-xl text-white sm:text-[2.35rem]">
            You only pay when a customer walks in.
          </HeadingLg>
          <Body className="mt-4 max-w-md !text-white/75">
            {formatKes(SUCCESS_FEE)} per verified redemption. No listing fee, no
            percentage cut, no monthly minimum.
          </Body>
          <div className="mt-8">
            <PrimaryButtonLink href="/merchants" size="lg">
              List your shop
            </PrimaryButtonLink>
          </div>
          <p className="mt-4 text-[13px] text-white/60">
            Free to list · takes about two minutes
          </p>
        </div>
      </section>

      {/* The arithmetic, worked. More convincing to a cash business than a
          product screenshot, and it is the actual maths. */}
      <section className="mx-auto max-w-3xl px-5 py-14">
        <HeadingMd as="h2" className="text-xl">
          What it costs, on a real deal
        </HeadingMd>
        <Body className="mt-3 max-w-xl">
          The fee is a flat shilling amount, not a percentage — so it never
          scales with your basket.
        </Body>

        <div className="mt-6 rounded-card border border-line bg-white p-5 shadow-card">
          <p className="text-sm font-semibold text-ink">
            Chicken pilau{" "}
            <span className="font-normal text-secondary line-through">
              {formatKes(EXAMPLE_BEFORE)}
            </span>{" "}
            {formatKes(EXAMPLE_AFTER)}
          </p>
          <dl className="mt-4 flex flex-col gap-2">
            <div className="flex items-baseline justify-between text-sm">
              <dt className="text-secondary">Shopper pays you at the counter</dt>
              <dd className="tnum font-semibold text-ink">
                {formatKes(EXAMPLE_AFTER)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <dt className="text-secondary">Maanta success fee</dt>
              <dd className="tnum font-semibold text-ink">
                −{formatKes(SUCCESS_FEE)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-line pt-2 text-sm">
              <dt className="font-semibold text-ink">You keep</dt>
              <dd className="tnum font-bold text-ink">
                {formatKes(EXAMPLE_AFTER - SUCCESS_FEE)}
              </dd>
            </div>
          </dl>
        </div>

        <p className="mt-4 text-sm text-muted">
          The same {formatKes(SUCCESS_FEE)} applies whether the deal is worth{" "}
          {formatKes(200)} or {formatKes(5000)}.
        </p>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <HeadingMd as="h2" className="text-xl">
            How it works at your counter
          </HeadingMd>
          <ol className="mt-6 space-y-4">
            {STEPS.map(([title, sub], i) => (
              <li
                key={title}
                className="flex gap-4 rounded-card border border-line bg-stone p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-black">
                  {i + 1}
                </span>
                <div>
                  <HeadingMd as="h3">{title}</HeadingMd>
                  <Body className="mt-1">{sub}</Body>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The objection nobody asks out loud: what happens when my wallet is
          empty mid-day. Answering it plainly is worth more than hiding it. */}
      <section className="mx-auto max-w-3xl px-5 py-14">
        <HeadingMd as="h2" className="text-xl">
          A code always verifies
        </HeadingMd>
        <Body className="mt-3 max-w-xl">
          If your wallet can&apos;t cover the fee, the redemption still goes
          through. The {formatKes(SUCCESS_FEE)} is recorded as arrears and
          settles from your next top-up — the customer standing at your counter
          never sees a problem.
        </Body>
        <Body className="mt-3 max-w-xl">
          The one thing an empty wallet stops is publishing a{" "}
          <em>new</em> deal. Deals already running keep redeeming.
        </Body>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <HeadingMd as="h2" className="text-xl">
            Plans
          </HeadingMd>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-card border border-line bg-stone p-5">
              <HeadingMd as="h3">Standard</HeadingMd>
              <p className="mt-1 text-2xl font-black text-ink">Free</p>
              <ul className="mt-4 space-y-2">
                {["One active deal", `${formatKes(SUCCESS_FEE)} per verified redemption`, "No monthly fee, ever"].map(
                  (line) => (
                    <li
                      key={line}
                      className="flex items-start gap-2 text-sm text-secondary"
                    >
                      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-verified" />
                      {line}
                    </li>
                  )
                )}
              </ul>
            </div>
            <div className="rounded-card border border-line bg-stone p-5">
              <HeadingMd as="h3">Elite</HeadingMd>
              <p className="mt-1 text-2xl font-black text-ink">
                {formatKes(3500)}
                <span className="text-sm font-normal text-muted"> /month</span>
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "Two active deals, plus flash deals",
                  "Boost a deal to the top of the feed",
                  "30-day trial, then stays free on Standard if you don't convert",
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2 text-sm text-secondary"
                  >
                    <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-verified" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted">
            The {formatKes(SUCCESS_FEE)} success fee is the same on both plans.{" "}
            <Link href="/pricing" className="font-semibold text-ink underline underline-offset-4">
              Full pricing
            </Link>
          </p>
        </div>
      </section>

      <section className="border-b border-line bg-brand">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <HeadingMd as="h2" className="text-xl">
            Start at BBS Mall
          </HeadingMd>
          <Body className="mt-3 max-w-xl !text-ink/80">
            Maanta opens at BBS Mall, Eastleigh. Shoppers browse a live feed of
            what&apos;s on offer inside the building and walk in with a code.
          </Body>
          <div className="mt-6">
            <PrimaryButtonLink
              href="/merchants"
              size="lg"
              className="!bg-ink !text-white hover:!bg-ink/90"
            >
              List your shop
            </PrimaryButtonLink>
          </div>
          <p className="mt-4 text-[13px] text-ink/70">
            Or ask a Maanta agent at BBS Mall to sign you up in person.
          </p>
        </div>
      </section>
    </main>
  );
}
