import { formatKes, formatCode } from "@/lib/ui";
import { FACTS } from "@/lib/marketing/facts";
import { SAMPLE_DEALS, SAMPLE_CODE } from "@/lib/marketing/sample-deals";
import { IconCheck } from "@/components/ui/icons";

/**
 * `/shoppers` — the three steps, drawn.
 *
 * A shopper who has never used MAANTA is being asked to walk to a counter and
 * read six digits to a stranger. Three sentences describe that; three pictures
 * of the actual screens let them recognise it when it happens. That is the whole
 * purpose — familiarisation, not decoration — which is why each panel is drawn
 * from the real component rather than invented:
 *
 *  - **Find a deal** — the feed row, same anatomy as `HeroShot`.
 *  - **Claim it** — `(shopper)/tickets/[id]/claimed-code.tsx`: white card, amber
 *    *border* (never fill), "FOR THE SHOP", the grouped code, the live countdown.
 *  - **Show the code** — the `status === "success"` branch of the ticket page:
 *    ink-bordered check, "Redeemed" chip, "Code verified", the code as a
 *    reference in cream.
 *
 * ## Why this exists as its own component and its own decision
 *
 * `HeroShot` is Home-only, and `marketing-hero-shot.test.ts` asserts it — with
 * the comment that adding it to another page "needs its own decision rather than
 * inherited silently". This is that second surface. Founder decision 2026-08-16,
 * asked and answered before it was built: illustrated rather than screenshotted,
 * shopper flow, `/shoppers` only. Drift row **D50** covers both surfaces now.
 *
 * Screenshots were the alternative and were declined for a reason worth keeping:
 * a capture taken today would show **demo data** — 213 of 214 merchants are
 * `is_demo` — so it would present the same invented shops while *looking* like
 * genuine evidence. A labelled illustration is the more honest artefact, not the
 * lazier one. It also costs no image bytes on mall wifi and cannot go silently
 * stale, since it restyles with the tokens and no test can catch a stale PNG.
 *
 * ## Frozen rules this depicts, and must keep depicting
 *
 *  - **Rule 6** — the code card carries the six digits and no price. The
 *    countdown is the real component's and stays; a *price* must never appear
 *    inside that card. `marketing-hero-shot.test.ts` fails if `KES` does.
 *  - **Rule 3** — money is ink and tabular, never amber, never celebrated. The
 *    verified panel is deliberately flat: a check in an ink circle, no confetti,
 *    no green wash. Money moved; that is not a party.
 *  - **Rule 1** — these panels contain **no** amber action. The only amber is the
 *    code card's border and the mall dot, both of which are the real UI. The
 *    page's one amber action is its CTA, and it stays that way.
 */

/** One shopper, one deal, all three panels — so the walkthrough invents nothing new. */
const JOURNEY = SAMPLE_DEALS[0];

const STEPS = [
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
] as const;

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-[190px] items-center justify-center overflow-hidden rounded-2xl border border-line bg-stone p-3"
    >
      {children}
    </div>
  );
}

/** Step 1 — the feed row, matching the deal-card anatomy the app actually renders. */
function FeedPanel() {
  return (
    <div className="w-full max-w-[230px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-white px-2 py-0.5 text-[10px] font-semibold text-ink">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
          {FACTS.launchMall.split(",")[0]}
        </span>
        <span className="text-[10px] font-medium text-muted">Deals near you</span>
      </div>
      {[JOURNEY, SAMPLE_DEALS[1]].map((d) => (
        <div
          key={d.shop}
          className="mb-2 flex gap-2.5 rounded-card border border-line bg-white p-2 shadow-card"
        >
          <div className="h-11 w-11 shrink-0 rounded-lg bg-cream-dark" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-medium text-muted">{d.shop}</p>
            <p className="truncate text-[12px] font-bold leading-tight text-ink">{d.deal}</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              {/* Money is ink — frozen rule 3. */}
              <span className="tnum text-[12px] font-black text-ink">{formatKes(d.now)}</span>
              <span className="tnum text-[10px] text-muted line-through">{formatKes(d.was)}</span>
              <span className="ml-auto shrink-0 text-[9px] text-faint">{d.away}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Step 2 — the claimed-code card.
 *
 * Drawn from `claimed-code.tsx` so a shopper recognises it at the counter: the
 * amber *border* rather than an amber fill, the label above, the grouped digits,
 * the countdown below. **No price appears here** — frozen rule 6, and the real
 * card has none either.
 */
function CodePanel() {
  return (
    <div className="w-full max-w-[210px]">
      <p className="mb-2 truncate text-center text-[10px] font-medium text-muted">
        {JOURNEY.shop} · {JOURNEY.deal}
      </p>
      <div className="rounded-2xl border-[2.5px] border-brand bg-white px-4 py-4">
        <div className="text-center text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
          For the shop
        </div>
        <div className="font-code mt-1.5 text-center text-[26px] font-medium tracking-[0.14em] text-ink">
          {formatCode(SAMPLE_CODE)}
        </div>
        <div className="mt-2 flex flex-col items-center gap-0.5">
          <div className="font-code text-base font-semibold text-ink">4:52</div>
          <div className="text-[10px] text-muted">until this code expires</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Step 3 — the verified state.
 *
 * Deliberately flat. The real screen marks a money movement with an ink-bordered
 * check and a chip, not a celebration (frozen rule 3), and an illustration that
 * added a flourish would be teaching the wrong screen.
 */
function VerifiedPanel() {
  return (
    <div className="flex w-full max-w-[210px] flex-col items-center text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-ink bg-white">
        <IconCheck className="h-5 w-5 text-ink" />
      </span>
      <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-white px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-ink">
        REDEEMED
      </span>
      <p className="mt-2 text-[15px] font-bold text-ink">Code verified</p>
      <p className="mt-0.5 truncate text-[10px] text-secondary">
        {JOURNEY.deal} · {JOURNEY.shop}
      </p>
      <div className="mt-2 rounded-lg border border-line bg-cream px-2.5 py-1">
        <span className="font-code text-[10px] tracking-[0.06em] text-secondary">
          {formatCode(SAMPLE_CODE)}
        </span>
      </div>
    </div>
  );
}

const PANELS = [FeedPanel, CodePanel, VerifiedPanel] as const;

export function ShopperWalkthrough() {
  return (
    <div className="mt-10">
      {/*
        The mockups are aria-hidden, so this is the only thing assistive tech
        receives. It describes the flow — which is the useful part — and states
        that the content is invented, which is the honest part.
      */}
      <p className="sr-only">
        Illustration of the three MAANTA shopper screens: the deal feed for your mall,
        the claimed {FACTS.codeLength}-digit code held for you with a countdown, and the
        verified confirmation shown once the shop checks the code. The shops and prices
        shown are invented examples, not real offers.
      </p>

      <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((s, i) => {
          const Art = PANELS[i];
          return (
            <li key={s.title}>
              <Panel>
                <Art />
              </Panel>
              <div className="mt-4 flex items-baseline gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper text-[13px] font-black text-ink"
                >
                  {i + 1}
                </span>
                <h3 className="text-base font-bold text-ink">{s.title}</h3>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">{s.body}</p>
            </li>
          );
        })}
      </ol>

      {/*
        The disclosure — visible, adjacent, caption weight. Same rule as HeroShot:
        a disclosure nobody reads is not a disclosure.
      */}
      <p className="mt-6 text-center text-[11px] leading-relaxed text-faint">
        Illustration · example shops and prices
      </p>
    </div>
  );
}
