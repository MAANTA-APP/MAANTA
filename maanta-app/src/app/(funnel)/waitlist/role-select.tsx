import { Button } from "@/components/ui/button";
import { StepProgress, TestNotice } from "@/components/funnel/pieces";
import { FACTS } from "@/lib/marketing/facts";
import { WAITLIST_SEGMENT_OPTIONS, type WaitlistSegment } from "@/lib/waitlist";

/**
 * Step 1 of 2 — "Which one describes you?" (board 2, M4).
 *
 * A plain GET form, server-rendered, no JavaScript required: the choice lands
 * in the URL as `?role=`, which is also the link other pages preset. Radio cards
 * select in **ink** — amber is reserved for the one button that moves you on.
 *
 * The card copy lives here, keyed by segment, and the cards themselves are
 * driven from `WAITLIST_SEGMENT_OPTIONS`: an entry point that keeps its own
 * list is how the landing form once filed every merchant as a shopper.
 */
const ROLE_COPY: Record<WaitlistSegment, { title: string; blurb: string }> = {
  shopper: { title: "I shop at the mall", blurb: "Get told when there are deals to claim." },
  merchant: { title: "I run a shop", blurb: "Publish deals and get paid at your counter." },
  mall_operator: { title: "I manage a mall", blurb: "Bring a node to your floors." },
};

export function RoleSelect({
  carry,
  isTest,
  defaultRole = "shopper",
}: {
  /** Query params that must survive into step 2 — the test token, a prefilled email, UTMs. */
  carry: Record<string, string>;
  isTest: boolean;
  defaultRole?: WaitlistSegment;
}) {
  return (
    <form method="get" action="/waitlist">
      {Object.entries(carry).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <StepProgress step={1} total={2} />
      {isTest ? <TestNotice /> : null}

      <h1 className="text-balance text-[30px] font-extrabold leading-[1.08] tracking-[-0.034em] text-ink lg:text-[36px]">
        Which one describes you?
      </h1>
      <p className="mt-2.5 text-base leading-relaxed text-secondary lg:text-[17px]">
        So we send you the right message when {FACTS.nodeLabel} opens.
      </p>

      <fieldset className="mt-5 flex flex-col gap-2.5">
        <legend className="sr-only">I am joining as</legend>
        {WAITLIST_SEGMENT_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="group relative flex cursor-pointer items-start gap-3.5 rounded-[18px] border-2 border-line bg-white p-[18px] transition-colors has-[:checked]:border-ink has-[:checked]:bg-paper has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink has-[:focus-visible]:ring-offset-2 lg:p-5"
          >
            <input
              type="radio"
              name="role"
              value={option.value}
              defaultChecked={option.value === defaultRole}
              className="sr-only"
            />
            <span
              aria-hidden
              className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-line bg-white group-has-[:checked]:border-ink"
            >
              <span className="hidden h-[11px] w-[11px] rounded-full bg-ink group-has-[:checked]:block" />
            </span>
            <span className="block">
              <span className="block text-lg font-bold leading-tight tracking-[-0.02em] text-ink lg:text-[19px]">
                {ROLE_COPY[option.value].title}
              </span>
              <span className="mt-1 block text-[15px] leading-snug text-secondary lg:text-base">
                {ROLE_COPY[option.value].blurb}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="mt-5">
        <Button type="submit" full>
          Continue
        </Button>
      </div>
      <p className="mt-3.5 text-center text-[13px] leading-relaxed text-muted lg:text-sm">
        One step left. A phone number, and an email for the confirmation.
      </p>
    </form>
  );
}
