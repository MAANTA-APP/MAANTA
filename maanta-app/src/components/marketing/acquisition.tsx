import Link from "next/link";
import { formatKes } from "@/lib/ui";
import { FACTS, NODE_TEAM } from "@/lib/marketing/facts";
import { SAMPLE_CODE, SAMPLE_DEALS } from "@/lib/marketing/sample-deals";
import { TrackedLink } from "./tracked";
import { MARKETING_EVENTS } from "@/lib/marketing/analytics-events";

/**
 * The acquisition-page pieces from design board 1 (2026-09-05): the code
 * example, the three doors, the numbered loop, the Node 0 block, the honest
 * status block and the example deal card.
 *
 * Every number reads from `facts.ts`; every invented thing reads from
 * `sample-deals.ts` and says on its face that it is an example. Amber is spent
 * on the page's one primary action and nowhere here — selection, numbering and
 * emphasis are ink.
 */

/** Mono eyebrow above a section heading — "Which one are you?". */
export function Eyebrow({ children, tone = "dark" }: { children: React.ReactNode; tone?: "dark" | "light" }) {
  return (
    <p
      className={`font-mono text-[11px] font-semibold uppercase tracking-[0.14em] ${
        tone === "light" ? "text-white/60" : "text-muted"
      }`}
    >
      {children}
    </p>
  );
}

/** "Node 0 · BBS Mall, Eastleigh" — a bordered mono pill. Ink on white, never amber text. */
export function NodePill({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${
        tone === "light" ? "border-white/25 text-brand" : "border-line bg-white text-secondary"
      }`}
    >
      {FACTS.nodeLabel} · {FACTS.launchMall}
    </span>
  );
}

/**
 * Six digits in tiles, slashed zero. `SAMPLE_CODE`, because a plausible-looking
 * credential in marketing deserves one shared source and a stated disclosure.
 */
export function CodeTiles({ tone = "dark", size = "md" }: { tone?: "dark" | "light"; size?: "md" | "lg" }) {
  const digits = SAMPLE_CODE.split("");
  return (
    <div aria-hidden="true" className="flex gap-1.5 sm:gap-2">
      {digits.map((d, i) => (
        <span
          key={i}
          className={`flex flex-1 items-center justify-center rounded-[11px] border font-mono font-bold [font-feature-settings:'zero'] ${
            size === "lg" ? "h-14 text-2xl sm:h-16 sm:text-[28px]" : "h-11 text-lg sm:h-12 sm:text-xl"
          } ${
            tone === "light"
              ? "border-white/15 bg-white/5 text-white"
              : "border-line bg-white text-ink shadow-card"
          }`}
        >
          {d}
        </span>
      ))}
    </div>
  );
}

/** The hero's right-hand card on Home: "Your code at the counter · Example". */
export function CodeExampleCard() {
  return (
    <figure className="rounded-card bg-stone p-5 sm:p-6">
      <figcaption className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-ink">Your code at the counter</span>
        <span className="rounded-[5px] border border-line bg-white px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Example
        </span>
      </figcaption>
      <div className="mt-4">
        <CodeTiles size="lg" />
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-secondary">
        {FACTS.codeLength} digits, read out loud at the till. Slashed zero so nobody misreads O
        for 0.
      </p>
      <p className="sr-only">An invented example code. Real codes are issued per claim and used once.</p>
    </figure>
  );
}

/**
 * The three doors — the load-bearing section of Home. The caller passes the
 * audience-door event so the page itself declares what it measures
 * (`marketing-analytics.test.ts` reads the page, not this file).
 */
export function Doors({
  doors,
  event = MARKETING_EVENTS.audienceDoor,
}: {
  doors: ReadonlyArray<{ title: string; body: React.ReactNode; label: string; href: string }>;
  event?: (typeof MARKETING_EVENTS)[keyof typeof MARKETING_EVENTS];
}) {
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-3 lg:gap-5">
      {doors.map((d, i) => (
        <TrackedLink
          key={d.href}
          href={d.href}
          event={event}
          name={d.title}
          location="doors"
          className="group flex flex-col rounded-card bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-md sm:p-7"
        >
          <span className="font-mono text-[11px] font-semibold text-muted">
            {String(i + 1).padStart(2, "0")}
          </span>
          <h3 className="mt-3 text-xl font-extrabold tracking-[-0.02em] text-ink">{d.title}</h3>
          <p className="mt-2 flex-1 text-[15px] leading-relaxed text-secondary">{d.body}</p>
          <span className="mt-5 text-sm font-bold text-ink underline underline-offset-4">
            {d.label}{" "}
            <span aria-hidden="true" className="inline-block no-underline transition-transform group-hover:translate-x-1">
              →
            </span>
          </span>
        </TrackedLink>
      ))}
    </div>
  );
}

/**
 * Numbered steps, 01–04. `after` lets a step carry something beneath its body —
 * the shopper page puts the code tiles under "Claim the deal".
 */
export function LoopSteps({
  steps,
  columns = 4,
}: {
  steps: ReadonlyArray<{ title: string; body: React.ReactNode; after?: React.ReactNode }>;
  columns?: 3 | 4;
}) {
  return (
    <ol
      className={`mt-8 grid gap-4 sm:grid-cols-2 ${
        columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
      }`}
    >
      {steps.map((s, i) => (
        <li key={s.title} className="rounded-card bg-white p-6 shadow-card">
          <span aria-hidden="true" className="font-mono text-[11px] font-semibold text-muted">
            {String(i + 1).padStart(2, "0")}
          </span>
          <h3 className="mt-3 text-lg font-bold tracking-[-0.01em] text-ink">{s.title}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-secondary">{s.body}</p>
          {s.after ? <div className="mt-4">{s.after}</div> : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * "Where it opens." The pilot, named as the pilot — and, when `staffing` is
 * on, how a node is staffed by design. The footnote is not optional: two big
 * numerals beside a mall's name read as a headcount unless the page says they
 * are not one.
 */
export function NodeBlock({
  lead,
  staffing = false,
  linkLabel,
}: {
  lead: React.ReactNode;
  staffing?: boolean;
  linkLabel: string;
}) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
      <div>
        <p className="max-w-3xl text-base leading-relaxed text-secondary sm:text-lg">{lead}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <NodePill />
          <span className="rounded-pill bg-stone px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary">
            Pilot location
          </span>
        </div>
        <Link
          href="/malls/bbs-mall"
          className="mt-6 inline-block text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary"
        >
          {linkLabel}
        </Link>
      </div>
      {staffing ? (
        <div className="rounded-card bg-white p-5 shadow-card sm:p-6">
          <dl className="flex flex-col gap-4">
            <div className="flex items-start gap-4">
              <dt className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-ink font-mono text-xl font-bold text-white">
                {NODE_TEAM.managers}
              </dt>
              <dd className="text-[15px] leading-relaxed text-secondary">
                <strong className="font-bold text-ink">One node manager</strong> {NODE_TEAM.managerRole}.
              </dd>
            </div>
            <div className="flex items-start gap-4">
              <dt className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-ink font-mono text-xl font-bold text-white">
                {NODE_TEAM.agentsMax}
              </dt>
              <dd className="text-[15px] leading-relaxed text-secondary">
                <strong className="font-bold text-ink">Up to {NODE_TEAM.agentsMax} agents</strong>{" "}
                {NODE_TEAM.agentRole}.
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            That is how a node is staffed by design. It is not a count of people standing in{" "}
            {FACTS.launchMall} today.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * "Where we actually are." The signed status block that stands where a SaaS
 * page would put a logo wall. Rendered only while pre-launch — see
 * `SHOW_PRELAUNCH_STATUS_BLOCK`.
 */
export function StatusBlock() {
  const fee = formatKes(FACTS.successFeeKes);
  return (
    <div className="rounded-card border border-white/15 bg-white/5 p-6 sm:p-8">
      <Eyebrow tone="light">Status · pre-launch</Eyebrow>
      <h2 className="mt-3 text-3xl font-extrabold leading-[1.1] tracking-[-0.03em] text-white sm:text-4xl">
        Where we actually are.
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
        Most pages like this one show logos and numbers. We are pre-launch, so here is the
        honest version instead.
      </p>
      <ul className="mt-6 flex flex-col gap-3">
        {[
          "No shops have signed up yet, so we show you none.",
          "No deal has been redeemed, so we quote no savings.",
          "Deals in the feed are demo examples, and they say so.",
        ].map((line) => (
          <li key={line} className="flex items-start gap-3 text-[15px] leading-relaxed text-white/85">
            <span aria-hidden="true" className="mt-2.5 block h-1.5 w-1.5 shrink-0 rounded-[2px] bg-white/50" />
            {line}
          </li>
        ))}
      </ul>
      <p className="mt-6 border-t border-white/15 pt-5 text-[15px] leading-relaxed text-white">
        <strong className="font-bold">What is real:</strong> the product is built, and the {fee} fee
        per verified redemption is a commitment we will hold you to.
      </p>
    </div>
  );
}

/**
 * "What a deal looks like." One invented deal from the shared list, drawn as the
 * card the feed will show — priced, timed, tied to a unit — with the disclosure
 * on its face and repeated for assistive tech. The claim button is a drawing of
 * one, in ink, so the page keeps its single amber action.
 */
export function DealCardExample() {
  const d = SAMPLE_DEALS[0];
  return (
    <figure className="overflow-hidden rounded-card bg-white shadow-card">
      <div
        aria-hidden="true"
        className="relative flex h-40 items-center justify-center bg-stone"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/demo/deal-placeholder.svg" alt="" className="h-20 w-20 opacity-60" />
        <span className="absolute left-3 top-3 rounded-[5px] border border-line bg-white px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          Example — not a real offer
        </span>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3 text-[12px] font-medium text-muted">
          <span>Ground floor · {d.away}</span>
          <span className="rounded-pill bg-stone px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary">
            Ends soon
          </span>
        </div>
        <h3 className="mt-2 text-lg font-bold text-ink">{d.deal}</h3>
        <p className="mt-0.5 text-sm text-secondary">{d.shop}</p>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tracking-[-0.02em] text-ink">{formatKes(d.now)}</span>
          <span className="text-sm text-secondary line-through">{formatKes(d.was)}</span>
        </p>
        <span className="mt-4 flex h-11 items-center justify-center rounded-pill border border-ink bg-white text-sm font-semibold text-ink">
          Claim — available at launch
        </span>
      </div>
      <figcaption className="sr-only">
        An illustration of a deal card with an invented shop and price. Real deals, prices and
        shops appear when {FACTS.nodeLabel} opens.
      </figcaption>
    </figure>
  );
}

/** "When we'll get back to you." Two rows, both from RESPONSE_TIMES at the call site. */
export function ReplyTimes({ rows }: { rows: ReadonlyArray<{ channel: string; time: string }> }) {
  return (
    <dl className="mt-6 divide-y divide-line rounded-card bg-white shadow-card">
      {rows.map((r) => (
        <div key={r.channel} className="flex items-center justify-between gap-4 px-5 py-4">
          <dt className="text-[15px] text-secondary">{r.channel}</dt>
          <dd className="text-[15px] font-bold text-ink">{r.time}</dd>
        </div>
      ))}
    </dl>
  );
}
