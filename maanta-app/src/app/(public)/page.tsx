import {
  Body,
  HeadingLg,
  HeadingMd,
  Meta,
  PrimaryButtonLink,
  SecondaryButtonLink,
} from "@/components/ui/claude";
import { InstallPrompt } from "@/components/install-prompt";
import { LandingProductScreens } from "./landing-product-screens";
import { LandingMerchantWaitlist } from "./landing-merchant-waitlist";

/** Public landing — hero, product screens, how-it-works, and account CTAs. */
export default function LandingPage() {
  return (
    <main className="bg-stone">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(253,191,45,0.28),transparent_55%),radial-gradient(ellipse_at_90%_40%,rgba(10,92,52,0.12),transparent_50%),linear-gradient(180deg,#1A1A18_0%,#2A2824_100%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.35'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-16 text-center sm:pt-20">
          <p className="animate-fade-in text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
            Maanta
          </p>
          <HeadingLg className="mx-auto mt-3 max-w-xl animate-fade-in text-white sm:text-[2.35rem]">
            Claim in‑mall deals before you pay.
          </HeadingLg>
          <Body className="mx-auto mt-4 max-w-md animate-fade-in text-white/75">
            A live feed of deals at your mall — claim on your phone, redeem at
            the counter with a code.
          </Body>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 animate-fade-in sm:flex-row sm:items-center">
            <PrimaryButtonLink href="/feed" size="lg" className="sm:min-w-[11rem]">
              Browse live deals
            </PrimaryButtonLink>
            <PrimaryButtonLink
              href="/sign-up"
              size="lg"
              className="!bg-white !text-ink hover:!brightness-95 sm:min-w-[11rem]"
            >
              Create account
            </PrimaryButtonLink>
          </div>
          <p className="mt-4 animate-fade-in">
            <SecondaryButtonLink
              href="/login"
              size="md"
              className="!border-white/30 !bg-transparent !text-white hover:!bg-white/10"
            >
              Sign in
            </SecondaryButtonLink>
          </p>
          <Meta as="p" className="mt-6 text-white/55">
            Now live at BBS Mall, Eastleigh · Nairobi
          </Meta>
        </div>
      </section>

      {/* Product screens */}
      <section className="border-b border-line bg-white">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <HeadingMd as="h2" className="text-center text-xl">
            See Maanta in action
          </HeadingMd>
          <Body className="mx-auto mt-3 max-w-xl text-center">
            Browse live mall deals, claim on your phone, and redeem in person — no app store
            required.
          </Body>
          <div className="mt-10">
            <LandingProductScreens />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-3xl px-5 py-14">
        <HeadingMd as="h2" className="text-xl">
          How Maanta works
        </HeadingMd>
        <ol className="mt-6 space-y-4">
          {[
            [
              "Open deals near your mall",
              "Pick your mall and browse Flash picks, boosted favourites, and standard deals.",
            ],
            [
              "Claim on your phone",
              "Tap a deal to get a 6-digit code — valid for the deal window plus a 15-minute grace period.",
            ],
            [
              "Redeem at the counter with your code",
              "Show the code to shop staff and pay the deal price in person. No online checkout.",
            ],
          ].map(([title, sub], i) => (
            <li
              key={title}
              className="flex gap-4 rounded-card border border-line bg-white p-4 shadow-card"
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
      </section>

      {/* Mid-page CTA */}
      <section className="border-y border-line bg-ink">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-5 py-12 text-center">
          <HeadingMd as="h2" className="text-white">
            Ready to save at the mall?
          </HeadingMd>
          <Body className="max-w-md text-white/75">
            Create a free account to claim deals, save favourites, and track your codes.
          </Body>
          <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
            <PrimaryButtonLink href="/sign-up" size="lg" full className="sm:w-auto sm:min-w-[10rem]">
              Create account
            </PrimaryButtonLink>
            <SecondaryButtonLink
              href="/feed"
              size="lg"
              full
              className="!border-white/30 !bg-transparent !text-white hover:!bg-white/10 sm:w-auto sm:min-w-[10rem]"
            >
              Browse live deals
            </SecondaryButtonLink>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-14">
        <HeadingMd as="h2" className="text-xl">
          Built for Nairobi malls first
        </HeadingMd>
        <Body className="mt-3 max-w-xl">
          Maanta starts at BBS Mall (Node 0) — a precise, in-person loop for
          shoppers and merchants who already meet at the till. No online
          checkout. Just claim, show up, and save.
        </Body>
      </section>

      <section className="border-t border-line bg-white">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <HeadingMd as="h2" className="text-xl">
            For merchants &amp; malls
          </HeadingMd>
          <Body className="mt-3 max-w-xl">
            Maanta is live for shoppers at BBS Mall. Merchants and mall operators can
            join the waitlist for onboarding in the next nodes.
          </Body>
          <div className="mt-6">
            <LandingMerchantWaitlist />
          </div>
        </div>
      </section>

      <InstallPrompt />
    </main>
  );
}
