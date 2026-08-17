import { formatKes, formatCode } from "@/lib/ui";
import { FACTS } from "@/lib/marketing/facts";
import { SAMPLE_DEALS, SAMPLE_CODE } from "@/lib/marketing/sample-deals";
import { IconCheck } from "@/components/ui/icons";

/**
 * `/merchants` — the four counter steps, drawn.
 *
 * The shopper walkthrough exists so a first-timer recognises a screen. This one
 * exists for a sharper reason: **a merchant's fear is a surprise debit**, and the
 * product's answer is a two-step resolve-then-charge where the fee is on screen
 * before the only button that charges. That is impossible to convey in a sentence
 * and obvious in a picture, so the fee-disclosure panel is the one that earns
 * this component.
 *
 * Every panel is drawn from the real screen, not invented:
 *
 *  - **Post a deal** — `merchant/(app)/deals/new/new-deal-wizard.tsx` field labels
 *    (Title, price, Was price).
 *  - **A shopper claims it** — the shopper's own code card. Deliberately included:
 *    staff should recognise *what the customer will hold up* before it happens.
 *  - **Verify** — `merchant/(app)/redeem/redeem-keypad.tsx`: six cells, `font-code`,
 *    active cell ink-bordered, "Enter the customer's 6-digit code".
 *  - **They pay you, we charge {fee}** — the `disclose` screen: the "Code valid"
 *    chip in ink (never amber), "Collect from shopper" kept visually distinct from
 *    the fee, `FeeDisclosure` with its exact wording, and the single amber Confirm
 *    carrying the fee in its own label.
 *
 * ## The one amber fill, and why it is correct here
 *
 * The shopper walkthrough contains no amber action at all. This one contains
 * exactly one: the drawn `Confirm redemption — {fee} fee` button. Removing its
 * amber to keep the page's palette tidy would delete the very thing the panel is
 * teaching — that there is a *single* deliberate action, that it is the only thing
 * that charges, and that it names the fee on the button itself. It is aria-hidden,
 * non-interactive, and sits inside a bordered device panel under an "Illustration"
 * caption, so it does not compete with the page's real CTA as an action. The guard
 * pins it: exactly one amber fill in this file, and it is the Confirm.
 *
 * Frozen rules otherwise as everywhere: money is ink and tabular and never
 * celebrated (rule 3); the "Code valid" chip is ink because amber is reserved for
 * the Confirm (rule 1); the code card carries no price (rule 6).
 *
 * Founder decision 2026-08-17 — the second audience walkthrough, same terms as the
 * shopper one: illustrated rather than screenshotted, `/merchants` only. Drift row
 * **D50** covers all three illustrated surfaces.
 */

const JOURNEY = SAMPLE_DEALS[0];

/** The wallet figure used in the fee panel. Invented, like the shop. */
const SAMPLE_BALANCE = 500;

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-[210px] items-center justify-center overflow-hidden rounded-2xl border border-line bg-stone p-3"
    >
      {children}
    </div>
  );
}

/** Step 1 — the new-deal wizard, reduced to the three fields that decide a deal. */
function PostPanel() {
  return (
    <div className="w-full max-w-[200px] rounded-xl border border-line bg-white p-3">
      <p className="text-[10px] font-semibold text-muted">Title</p>
      <div className="mt-1 truncate rounded-lg border border-line px-2 py-1.5 text-[11px] font-medium text-ink">
        {JOURNEY.deal}
      </div>
      <div className="mt-2 flex gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-muted">Price</p>
          <div className="tnum mt-1 rounded-lg border border-line px-2 py-1.5 text-[11px] font-bold text-ink">
            {formatKes(JOURNEY.now)}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-muted">Was</p>
          <div className="tnum mt-1 rounded-lg border border-line px-2 py-1.5 text-[11px] font-medium text-muted">
            {formatKes(JOURNEY.was)}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-faint">
        You set the price, how many you honour, and when it ends.
      </p>
    </div>
  );
}

/** Step 2 — what the customer will hold up. The shopper's card, from their phone. */
function ShopperCodePanel() {
  return (
    <div className="w-full max-w-[190px]">
      <p className="mb-2 text-center text-[9px] font-medium uppercase tracking-wide text-faint">
        On the customer&apos;s phone
      </p>
      <div className="rounded-2xl border-[2.5px] border-brand bg-white px-4 py-4">
        <div className="text-center text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
          For the shop
        </div>
        <div className="font-code mt-1.5 text-center text-[24px] font-medium tracking-[0.14em] text-ink">
          {formatCode(SAMPLE_CODE)}
        </div>
        <div className="mt-2 flex flex-col items-center gap-0.5">
          <div className="font-code text-sm font-semibold text-ink">4:52</div>
          <div className="text-[9px] text-muted">until this code expires</div>
        </div>
      </div>
    </div>
  );
}

/** Step 3 — the keypad. Entering six digits resolves the code and charges nothing. */
function KeypadPanel() {
  const entered = SAMPLE_CODE.slice(0, 4).split("");
  return (
    <div className="w-full max-w-[210px]">
      <p className="text-center text-[10px] font-medium text-muted">
        Enter the customer&apos;s {FACTS.codeLength}-digit code
      </p>
      <div className="mt-2.5 flex justify-center gap-1.5">
        {Array.from({ length: FACTS.codeLength }).map((_, i) => (
          <div
            key={i}
            className={[
              "font-code flex h-10 w-7 items-center justify-center rounded-lg border bg-white text-sm font-semibold text-ink",
              i === entered.length
                ? "border-2 border-ink"
                : entered[i]
                  ? "border-ink/80"
                  : "border-line",
            ].join(" ")}
          >
            {entered[i] ?? ""}
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[9px] leading-relaxed text-faint">
        This only resolves the code.
        <br />
        Nothing is charged yet.
      </p>
    </div>
  );
}

/**
 * Step 4 — the fee, before the action.
 *
 * The panel this component exists for. `FeeDisclosure`'s exact wording, the
 * collect-amount kept visually separate from the fee because they are different
 * amounts paid by different people, and the single amber Confirm naming the fee.
 */
function FeePanel() {
  const fee = FACTS.successFeeKes;
  return (
    <div className="w-full max-w-[200px]">
      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink">
        <IconCheck className="h-3 w-3 text-verified" />
        Code valid
      </span>
      <div className="mt-1.5 flex items-baseline justify-between rounded-lg border border-line bg-white px-2.5 py-1.5">
        <span className="text-[10px] font-medium text-secondary">Collect from shopper</span>
        <span className="tnum text-[12px] font-bold text-ink">{formatKes(JOURNEY.now)}</span>
      </div>
      <div className="mt-1.5 rounded-lg border border-line bg-white p-2.5">
        <p className="text-[10px] font-bold text-ink">
          This redemption costs {formatKes(fee)}
        </p>
        <div className="mt-1.5 flex items-baseline justify-between text-[9px]">
          <span className="text-secondary">MAANTA success fee</span>
          <span className="tnum font-semibold text-ink">−{formatKes(fee)}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between border-t border-line pt-1 text-[9px]">
          <span className="text-secondary">Wallet balance after</span>
          <span className="tnum font-bold text-ink">{formatKes(SAMPLE_BALANCE - fee)}</span>
        </div>
      </div>
      {/* The one amber fill in this file — see the docblock. Black label, per rule 2. */}
      <div className="mt-2 rounded-full bg-brand px-2 py-1.5 text-center text-[10px] font-semibold text-black">
        Confirm redemption — {formatKes(fee)} fee
      </div>
    </div>
  );
}

const PANELS = [PostPanel, ShopperCodePanel, KeypadPanel, FeePanel] as const;

export function MerchantWalkthrough({ steps }: { steps: ReadonlyArray<{ title: string; body: string }> }) {
  return (
    <div className="mt-10">
      <p className="sr-only">
        Illustration of the four MAANTA merchant counter screens: posting a deal, the
        {" "}
        {FACTS.codeLength}-digit code as it appears on the customer&apos;s phone, the keypad
        where staff enter that code, and the confirmation screen showing the amount to
        collect and the {formatKes(FACTS.successFeeKes)} success fee before the single
        button that charges it.{" "}
        {/* Kept on one line: the guard looks for this phrase contiguously, and a
            disclosure that a reflow can silently defeat is not a guarded one. */}
        The shop, prices and code shown are invented examples, not real offers.
      </p>

      <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => {
          const Art = PANELS[i];
          return (
            <li key={s.title}>
              <Panel>{Art ? <Art /> : null}</Panel>
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

      <p className="mt-6 text-center text-[11px] leading-relaxed text-faint">
        Illustration · example shop, prices and code
      </p>
    </div>
  );
}
