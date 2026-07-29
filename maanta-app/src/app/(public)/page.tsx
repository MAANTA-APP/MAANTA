import Link from "next/link";
import {
  Body,
  HeadingLg,
  HeadingMd,
  PrimaryButtonLink,
} from "@/components/ui/claude";
import { InstallPrompt } from "@/components/install-prompt";
import { LandingEarlyAccess } from "./landing-early-access";

/** Public landing — Claude-calm + Maanta mall story. */
export default function LandingPage() {
  return (
    <main className="bg-stone">
      {/* Hero — brand-first, one composition */}
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
          {/* R-TAGLINE — the tagline is frozen, exact, and belongs on the one
              screen that introduces the product. */}
          <p className="animate-fade-in mt-1.5 text-sm font-semibold text-white/80">
            Discover, Claim and Redeem.
          </p>
          <HeadingLg className="mx-auto mt-3 max-w-xl animate-fade-in text-white sm:text-[2.35rem]">
            Claim in‑mall deals before you pay.
          </HeadingLg>
          <Body className="mx-auto mt-4 max-w-md animate-fade-in text-white/75">
            A live feed of deals at your mall — claim on your phone, redeem at
            the counter with a code.
          </Body>
          {/* One action in the hero. Install is a quiet text link, and early
              access keeps its own section below — three competing buttons here
              split the decision and cost the primary action. */}
          <div className="mt-8 flex flex-col items-center gap-1 animate-fade-in">
            <PrimaryButtonLink href="/feed" size="lg">
              Browse live deals
            </PrimaryButtonLink>
            <Link
              href="/download"
              className="inline-flex min-h-[44px] items-center px-4 text-sm font-semibold text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              Install the app
            </Link>
          </div>

          {/* Trust strip — the strongest proof on the page, so it reads as a
              component rather than a caption. */}
          <div className="mt-6 flex justify-center animate-fade-in">
            <p className="inline-flex items-center gap-2 rounded-pill border border-white/25 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white/90">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                aria-hidden
              />
              Live at BBS Mall, Eastleigh · Nairobi
            </p>
          </div>
        </div>
      </section>

      {/* Claim → code → counter is the unfamiliar part. It has to land before
          the feature grid means anything. */}
      <section className="mx-auto max-w-3xl px-5 py-14">
        <HeadingMd as="h2" className="text-xl">
          How Maanta works
        </HeadingMd>
        <ol className="mt-6 space-y-4">
          {[
            ["Discover", "Open the feed for your mall — Flash, Boosted, and near you."],
            ["Claim", "Tap a deal and get a 6-digit code on your phone."],
            ["Redeem", "Show the code at the counter and pay the deal price in person."],
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

      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <HeadingMd as="h2" className="text-xl">
            Malls have deals. Shoppers rarely see them.
          </HeadingMd>
          <Body className="mt-3 max-w-xl">
            Merchants write offers on chalkboards and WhatsApp groups. Shoppers walk
            past without knowing. Maanta puts every live deal on one screen — before
            you pay at the till.
          </Body>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-14">
        <HeadingMd as="h2" className="text-xl">
          A live feed for in‑mall deals
        </HeadingMd>
        <Body className="mt-3 max-w-xl">
          Flash picks, boosted neighbourhood favourites, and standard deals near you —
          filtered to the mall you&apos;re in. Save favourites and open the map
          when you&apos;re ready to redeem.
        </Body>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["Flash", "Short-window top picks"],
            ["Boosted", "Neighbourhood favourites pushed to the top"],
            ["Map", "Pins with precise pickup spots"],
          ].map(([title, sub], i) => (
            <div
              key={title}
              className="animate-fade-in rounded-card border border-line bg-white p-5 [animation-fill-mode:both]"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <HeadingMd as="h3">{title}</HeadingMd>
              <Body className="mt-1.5 text-muted">{sub}</Body>
            </div>
          ))}
        </div>
      </section>

      {/* The merchant door. Outreach at BBS tells shopkeepers to "check out
          Maanta" — without this they land on a page with nothing for them. */}
      <section className="border-y border-line bg-brand">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <HeadingMd as="h2" className="text-xl">
            Run a shop at BBS Mall?
          </HeadingMd>
          <Body className="mt-3 max-w-xl !text-ink/80">
            You only pay when a customer walks in. KES 30 per verified
            redemption — no listing fee, no percentage cut, no monthly minimum.
          </Body>
          <div className="mt-6">
            <PrimaryButtonLink
              href="/for-merchants"
              size="lg"
              className="!bg-ink !text-white hover:!bg-ink/90"
            >
              List your shop
            </PrimaryButtonLink>
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
            Get early access
          </HeadingMd>
          <Body className="mt-3 max-w-xl">
            Join the waitlist as a shopper, merchant, or mall operator. We&apos;ll
            email you before the next drop.
          </Body>
          <div className="mt-6">
            <LandingEarlyAccess />
          </div>
        </div>
      </section>

      <InstallPrompt />
    </main>
  );
}
