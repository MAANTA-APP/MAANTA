import { formatCode } from "@/lib/ui";
import { SAMPLE_CODE } from "@/lib/marketing/sample-deals";

/**
 * `/help` — the two screens a worried shopper is actually trying to picture.
 *
 * The other two walkthroughs draw the happy path, because their job is
 * familiarisation. This page's job is different: someone arrives at `/help`
 * *because something went wrong*, and the two questions the FAQ answers —
 * "the code did not work, what now?" and the grace period — are both really the
 * same question, which is **"am I in trouble?"**
 *
 * So these panels deliberately draw the two failure states rather than the happy
 * path, and both carry the same answer: nothing is needed from you, and you were
 * never charged. Seeing the actual screen with that sentence on it does more than
 * a paragraph promising it.
 *
 * Drawn from `maanta-app/src/app/(shopper)/tickets/[id]/page.tsx` — the `expired`
 * branch and the `status === "flagged"` branch.
 *
 * ## Two deliberate departures from the real screen, both crops rather than lies
 *
 *  - **The CTA buttons are omitted.** The real screens end in "See live deals" and
 *    "Contact support", both amber primaries. They are not what these panels
 *    teach, and drawing them would put two amber fills on a page whose single
 *    amber action is its WhatsApp button. A crop is honest; a recoloured button
 *    would not be.
 *  - **These are not mounted in `HelpFaqs`.** That component is shared with
 *    `(shopper)/you/help`, inside the app shell — and showing a signed-in shopper
 *    a *drawing* of a screen they can simply open is noise. They live on the
 *    marketing page only.
 *
 * Frozen rules: the expired state is greyscale-legible (chip icon + word, struck
 * code in `faint`) with no red anywhere — failure is not an error; "under review"
 * uses rust, never yellow or red (rule 5); no money appears in either panel.
 */

function Panel({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption: string;
}) {
  return (
    <div>
      <div
        aria-hidden="true"
        className="flex h-[180px] items-center justify-center overflow-hidden rounded-2xl border border-line bg-stone p-4"
      >
        {children}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-secondary">{caption}</p>
    </div>
  );
}

/** The expired ticket. Struck code, no red, and an explanation rather than a scold. */
function ExpiredPanel() {
  return (
    <div className="w-full max-w-[210px]">
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-muted bg-white px-2.5 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-secondary">
          <span className="text-[8px]">○</span>
          EXPIRED
        </span>
      </div>
      <div className="mt-2.5 rounded-xl border-2 border-line bg-cream px-4 py-5 text-center">
        <p className="font-code text-[22px] text-faint line-through">
          {formatCode(SAMPLE_CODE)}
        </p>
      </div>
      <p className="mt-2.5 text-center text-[13px] font-bold text-ink">
        This code has expired
      </p>
      <p className="mt-1 text-center text-[10px] leading-relaxed text-secondary">
        The deal ended and the grace period has passed.
      </p>
    </div>
  );
}

/** The flagged ticket. Rust, never red — and the reassurance is the point. */
function UnderReviewPanel() {
  return (
    <div className="w-full max-w-[210px]">
      <div className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2">
        <span className="font-code text-sm text-ink">{formatCode(SAMPLE_CODE)}</span>
        <span className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-muted bg-white px-2 py-0.5 text-[8px] font-semibold tracking-[0.08em] text-secondary">
          <span className="text-[7px]">●</span>
          UNDER REVIEW
        </span>
      </div>
      <div className="mt-2.5 rounded-xl border border-rust px-3 py-2.5">
        <p className="text-[10px] font-bold leading-relaxed text-rust">
          This redemption is under review.
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-ink">
          Support will resolve it within 72 hours. Nothing is needed from you right now.
        </p>
      </div>
    </div>
  );
}

export function HelpStatePanels() {
  return (
    <div className="mt-8">
      <h2 className="text-base font-bold text-ink">If something goes wrong</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-secondary">
        These are the two screens people ask about. Neither costs you anything — there is
        no payment inside MAANTA at all.
      </p>

      <p className="sr-only">
        Illustrations of two MAANTA ticket screens. First, an expired code: the code is
        shown struck through with an EXPIRED label and the message that the deal ended and
        the grace period has passed. Second, a redemption under review: the code is shown
        with an UNDER REVIEW label and a notice that support will resolve it within 72
        hours and nothing is needed from you. The code shown is an invented example.
      </p>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <Panel caption="An expired code. You are not charged, and the deal may still be running — check the feed for a fresh one.">
          <ExpiredPanel />
        </Panel>
        <Panel caption="A redemption held for review, usually because the claim was made away from the shop. Support resolves it within 72 hours.">
          <UnderReviewPanel />
        </Panel>
      </div>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-faint">
        Illustration · example code
      </p>
    </div>
  );
}
