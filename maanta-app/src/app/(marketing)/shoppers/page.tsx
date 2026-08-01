import type { Metadata } from "next";
import Link from "next/link";
import { formatKes } from "@/lib/ui";
import { FACTS } from "@/lib/marketing/facts";
import {
  AudienceHero,
  CtaBand,
  FaqAccordion,
  LiveDot,
  PointGrid,
  Section,
  SectionHeading,
  StepRail,
  TrustBar,
} from "@/components/marketing/sections";
import { SectionInView } from "@/components/marketing/tracked";

/**
 * `/shoppers` — 301 target for both `/for-shoppers` and `/how-it-works`.
 *
 * Written from the real logged-out UI (`copy/shoppers.md` §1): feed section
 * names, filters and the deal-card anatomy were all verified against the live app
 * without signing in. Describing the actual screen beats describing the idea.
 *
 * `#counter` is the most important section here and is deliberately reachable
 * within two scrolls on mobile. It exists to remove one specific fear — being
 * turned away at a till with people watching — which is the thing that actually
 * stops a shopper using this, not any doubt about the price.
 *
 * **A previously held claim is now published.** "A shop that does not honour its
 * own deals does not stay on MAANTA" was held because it promised an enforcement
 * process that did not exist. That process was defined on 2026-07-31 and written
 * into Terms of Service 6.3 — warn, then suspend publishing, then remove — so the
 * claim is backed by a clause a shopper can read.
 *
 * No deal or shop counts appear on this page, by rule. A shopper-facing count
 * must be true at the moment it is read; scenario constants are forbidden here.
 */

export const metadata: Metadata = {
  title: "For shoppers — MAANTA",
  description:
    "See the deals in your mall before you get there. Claim on your phone, show a 6-digit code at the counter, pay the deal price in person. Free, no card needed.",
  openGraph: {
    title: "The deals in your mall, before you get there.",
    description:
      "Claim on your phone, show a 6-digit code at the counter, pay the deal price in person.",
  },
};

export default function ShoppersPage() {
  const fee = formatKes(FACTS.successFeeKes);

  return (
    <>
      <AudienceHero
        eyebrow="For shoppers"
        title="The deals in your mall, before you get there."
        sub={
          <>
            Open the feed and see what the shops in your mall are offering right now. Tap a
            deal, get a {FACTS.codeLength}-digit code, and show it at the counter. You pay
            the deal price in person, the way you normally pay.
          </>
        }
        primary={{ label: "Browse live deals", href: "/feed" }}
        secondary={{ label: "Install the app", href: "/download" }}
        status={
          <>
            <p className="font-semibold text-ink">Free. No card. No sign-in needed to look.</p>
            <p className="mt-2 inline-flex items-center gap-2">
              <LiveDot />
              Live at {FACTS.launchMall} · {FACTS.city}
            </p>
          </>
        }
      />

      {/*
        The three things that actually stop a shopper: is this going to cost me,
        will I miss the window, and do I have to install something. Each is
        answered in full further down (#cost, #counter, #install) — this only
        gets the answer in front of someone who will not scroll that far.

        No counts, per the page rule above. Every value reads from FACTS.
      */}
      <TrustBar
        items={[
          {
            title: "Free, always",
            body: "No card, no online checkout, nothing to pay MAANTA. Shops pay the fee, never you.",
          },
          {
            title: <>{FACTS.graceMinutes} minutes of grace</>,
            body: (
              <>
                A claimed code lasts the deal&apos;s full window plus {FACTS.graceMinutes}{" "}
                minutes after it ends. You do not have to run.
              </>
            ),
          },
          {
            title: "Nothing to download",
            body: "It runs in your browser, and you can look around the whole feed without an account.",
          },
        ]}
      />

      <Section id="problem" tone="paper">
        <SectionHeading>The offers are already there. You just never see them.</SectionHeading>
        <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-secondary">
          <p>
            Shops write their offers on chalkboards, on paper taped to the shutter, and in
            WhatsApp groups you are not in. You walk past a shop that was doing forty percent
            off and find out on the way home.
          </p>
          <p className="text-ink">
            MAANTA puts all of it in one place, on your phone, before you decide where to go.
          </p>
        </div>
      </Section>

      <Section id="how">
        <SectionHeading>Three steps</SectionHeading>
        <StepRail
          steps={[
            {
              title: "Find a deal",
              body: "Open the feed for your mall. Deals are sorted by what is closest to you and what is ending soonest.",
            },
            {
              title: "Claim it",
              body: `Tap the deal. It is held for you and a ${FACTS.codeLength}-digit code appears on your phone.`,
            },
            {
              title: "Show the code",
              body: `Give the ${FACTS.codeLength} digits to the person at the counter. They check it, you pay the deal price, you leave.`,
            },
          ]}
        />
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink">
          No printing. No screenshots. No queue for a separate desk.
        </p>
      </Section>

      <Section id="feed" tone="paper">
        <SectionHeading>What is in the feed</SectionHeading>
        <PointGrid
          points={[
            {
              title: "Top picks near you.",
              body: "Flash deals — short windows, often under an hour. These are the ones worth walking to now.",
            },
            {
              title: "Neighbourhood favourites.",
              body: "Deals other shoppers have actually redeemed, pushed to the top.",
            },
            {
              title: "Deals near me.",
              body: "Everything else in your mall, with the distance in metres so you know if it is on your floor.",
            },
            {
              title: "The map.",
              body: "Pins with precise pickup spots, so you find the right shop the first time. Eastleigh has a lot of shops behind a lot of similar shutters.",
            },
          ]}
        />
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-secondary">
          You can filter by <em>Expiring soon</em>, <em>Flash</em>, <em>Live now</em> or{" "}
          <em>Today</em>, and sort by what is nearest.
        </p>
        <p className="mt-6 max-w-3xl rounded-card border border-line bg-white p-5 text-base leading-relaxed text-ink">
          Nothing here is ranked by stars or reviews. A deal moves up because people claimed
          it and actually redeemed it at the counter. You are seeing what other shoppers
          walked in for, not what someone rated five stars.
        </p>
      </Section>

      {/*
        The section that carries the page. Sits above #cost deliberately: the fear
        of being refused at the till stops more shoppers than any doubt about price.
      */}
      <Section id="counter">
        <SectionInView name="counter">
        <SectionHeading
          lead={
            <>
              The shop published the deal. They are expecting people to arrive with codes.{" "}
              <strong className="font-bold text-ink">You are not asking for a favour.</strong>
            </>
          }
        >
          What happens at the counter
        </SectionHeading>
        <PointGrid
          points={[
            {
              title: `They type the ${FACTS.codeLength} digits.`,
              body: "The same deal you claimed appears on their screen — the item, the price, the time.",
            },
            {
              title: "You pay the deal price.",
              body: "In cash, or however you normally pay that shop. The money goes to them directly.",
            },
            {
              title: `You have ${FACTS.graceMinutes} minutes after it ends.`,
              body: `A claimed code stays valid until the deal expires, plus a ${FACTS.graceMinutes}-minute grace period. You do not have to run.`,
            },
            {
              title: "If it does not work, you owe nothing.",
              body: "No charge, no penalty, nothing to cancel. Claiming a deal is not a purchase and it never becomes one.",
            },
          ]}
        />
      </SectionInView>
      </Section>

      <Section id="cost" tone="paper">
        <SectionInView name="cost">
        <SectionHeading>What it costs you</SectionHeading>
        <p className="mt-5 max-w-3xl text-xl font-bold leading-snug text-ink sm:text-2xl">
          Nothing. There is no version of MAANTA that charges you.
        </p>
        <PointGrid
          points={[
            {
              title: "No card details. Not now, not later.",
              body: "There is no online checkout in MAANTA. There is nowhere to enter a card, because no money is ever taken through the app.",
            },
            {
              title: "You pay the shop, in person.",
              body: "Exactly as you would if you had walked in without us.",
            },
            {
              title: "Claiming a deal is not buying it.",
              body: "If you change your mind, do nothing. It expires and that is the end of it.",
            },
            {
              title: "Your phone number, and nothing else.",
              body: "Browse the whole feed without an account. When you claim your first deal you give a phone number — and that is the sign-up. No password to invent, no email address, no form. The number exists so a code can be tied to one person and used once.",
            },
          ]}
        />
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink">
          Shops pay us a flat {fee} when a code is verified at their counter. That is the
          whole business. We have no reason to charge you and no reason to sell what we know
          about you —{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-secondary">
            our privacy policy
          </Link>{" "}
          sets out exactly what we hold.
        </p>
      </SectionInView>
      </Section>

      <Section id="install">
        <SectionHeading>Nothing to download</SectionHeading>
        <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-secondary">
          <p>
            MAANTA runs in your browser. There is no app store, no install, and nothing
            taking up space on your phone.
          </p>
          <p>
            If you use it often, add it to your home screen and it opens like any other app.
          </p>
        </div>
        <Link
          href="/download"
          className="mt-6 inline-block text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary"
        >
          How to add it to your home screen
        </Link>
      </Section>

      <Section id="where" tone="paper">
        <SectionHeading>Where it works</SectionHeading>
        <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-secondary">
          <p>
            MAANTA is live at{" "}
            <strong className="font-semibold text-ink">
              {FACTS.launchMall}, {FACTS.city}
            </strong>
            . That is our first mall, and the shops there are the ones publishing deals
            today.
          </p>
          <p>
            More malls are coming. If you want yours next,{" "}
            <Link href="/waitlist" className="underline underline-offset-4 hover:text-ink">
              tell us
            </Link>{" "}
            — we go where shoppers ask us to.
          </p>
        </div>
        <Link
          href="/malls/bbs-mall"
          className="mt-6 inline-block text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary"
        >
          See what&apos;s live at BBS Mall
        </Link>
      </Section>

      <Section id="faq">
        <SectionHeading>Questions</SectionHeading>
        <FaqAccordion
          page="shoppers"
          items={[
            {
              q: "Is it really free?",
              a: `Yes. Shops pay MAANTA a flat ${fee} when a code is verified at their counter. Shoppers pay nothing at any point.`,
            },
            {
              q: "Do I need to give card or M-Pesa details?",
              a: "No. There is no payment of any kind inside MAANTA. You pay the shop at the till.",
            },
            {
              q: "Do I need to download anything?",
              a: "No. It runs in your browser. You can add it to your home screen if you want it to open faster.",
            },
            {
              q: "What if the deal expires while I am walking to the shop?",
              a: `You have the deal's full window plus a ${FACTS.graceMinutes}-minute grace period after it ends. If you are in the mall, you have time.`,
            },
            {
              // Restored 2026-07-31: the enforcement process now exists and is
              // written into Terms of Service 6.3 (warn, then suspend, then
              // remove). The claim was held only because the clause was blank.
              q: "What if the shop will not honour it?",
              a: "Tell us. Every code is tied to a deal that shop published themselves, so we can see exactly what was promised. You are never charged either way, and a shop that does not honour its own deals does not stay on MAANTA.",
            },
            {
              q: "Do I need to make an account?",
              a: "Not to look around. When you claim your first deal you give a phone number, and that is your account — there is no password to remember and no email needed.",
            },
            {
              q: "Why does it need my phone number?",
              a: "So a code can be tied to one person and used once. It is not used to sell you anything you did not ask for.",
            },
            {
              q: "Are the deals real?",
              a: "Every deal is published by the shop itself, and rankings come from redemptions that staff verified at a counter — not from reviews or ratings.",
            },
          ]}
        />
      </Section>

      <CtaBand
        title="See what is live in your mall right now."
        body="No sign-up to look around."
        primary={{ label: "Browse live deals", href: "/feed" }}
        secondary={{ label: "Install the app", href: "/download" }}
      />
    </>
  );
}
