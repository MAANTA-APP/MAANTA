import { TrackedFaqItem, TrackedLink } from "./tracked";
import { SHOW_LIVE_INDICATOR } from "@/lib/marketing/live-claims";

/**
 * Marketing page primitives.
 *
 * Every copy deck has the same shape — hero, numbered steps, groups of named
 * points, a closing CTA band, an FAQ — so these are built once and parameterised
 * rather than rebuilt per page. That is also what keeps the six pages looking
 * like one site.
 *
 * Accent discipline throughout: `#FDBF2D` (`bg-brand`) appears on primary CTAs
 * and live-status dots only. Secondary actions are outlined, not filled. Broad
 * yellow reads flashy rather than premium, and spending the accent on decoration
 * leaves the actual call to action competing with it.
 *
 * Mobile first at 360px — the shopper audience is almost entirely mobile, and
 * most merchants will open these pages on a mid-range Android on mall wifi.
 */

export function Section({
  id,
  children,
  className = "",
  tone = "white",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  tone?: "white" | "paper" | "ink";
}) {
  // Direction A (decisions log 2026-08-22): the marketing ground is the same
  // stone wash the app uses, so the site and the product read as one surface.
  // `paper` keeps its name — it is the alternating tone, not a literal colour —
  // so no call site changes.
  const tones = {
    white: "bg-white",
    paper: "bg-stone",
    ink: "bg-ink text-white",
  } as const;
  return (
    <section id={id} className={`${tones[tone]} ${className}`}>
      <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  children,
  lead,
  tone = "dark",
}: {
  eyebrow?: string;
  children: React.ReactNode;
  lead?: React.ReactNode;
  tone?: "dark" | "light";
}) {
  return (
    <div className="max-w-3xl">
      {eyebrow ? (
        <p
          className={`text-xs font-bold uppercase tracking-wide ${
            tone === "light" ? "text-white/60" : "text-muted"
          }`}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={`mt-2 text-3xl font-bold leading-[1.15] tracking-[-0.025em] sm:text-4xl ${
          tone === "light" ? "text-white" : "text-ink"
        }`}
      >
        {children}
      </h2>
      {lead ? (
        <p
          className={`mt-4 text-base leading-relaxed sm:text-lg ${
            tone === "light" ? "text-white/70" : "text-secondary"
          }`}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}

/** Primary action. The one amber element on a page. */
function CtaPrimary({
  href,
  children,
  className = "",
  name = "primary",
  location = "unknown",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  /** Analytics identity. Defaults are deliberately vague so an unlabelled CTA
   *  shows up as "unknown" in the dashboard rather than silently vanishing. */
  name?: string;
  location?: string;
}) {
  return (
    <TrackedLink
      href={href}
      name={name}
      location={location}
      className={`inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-bold text-ink-soft shadow-card transition hover:-translate-y-px hover:brightness-95 active:translate-y-0 active:brightness-90 ${className}`}
    >
      {children}
    </TrackedLink>
  );
}

/** Secondary action — outlined, never filled, so it cannot compete with the CTA. */
function CtaSecondary({
  href,
  children,
  tone = "dark",
  className = "",
  name = "secondary",
  location = "unknown",
}: {
  href: string;
  children: React.ReactNode;
  tone?: "dark" | "light";
  className?: string;
  name?: string;
  location?: string;
}) {
  const styles =
    tone === "light"
      ? "border-white/30 text-white hover:bg-white/10"
      : "border-line text-ink hover:bg-paper";
  return (
    <TrackedLink
      href={href}
      name={name}
      location={location}
      className={`inline-flex items-center justify-center rounded-full border px-6 py-3 text-sm font-bold transition active:translate-y-px ${styles} ${className}`}
    >
      {children}
    </TrackedLink>
  );
}

export function AudienceHero({
  eyebrow,
  title,
  sub,
  primary,
  secondary,
  status,
  media,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub: React.ReactNode;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  /** Live-status or scenario line. Rendered under the actions, quietly. */
  status?: React.ReactNode;
  /**
   * Optional visual beside the copy. Board 1 (2026-09-05) retired the feed
   * mockup that used to fill it and the three acquisition pages now draw their
   * own heroes; other callers pass nothing and keep the single-column hero, which is why this is
   * optional rather than a required slot with an empty default — a hero with a
   * blank column reserved for a picture that never arrives is worse than one
   * that was never two columns.
   */
  media?: React.ReactNode;
}) {
  return (
    // Direction A: the hero shares the stone ground with the header instead of
    // fading to white, so the page reads as one surface and the white cards
    // below are what lift off it. Still no #FDBF2D spent on decoration.
    <section className="bg-stone">
      <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <div
          className={
            media
              ? "grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-14"
              : undefined
          }
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">{eyebrow}</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-6xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-secondary sm:text-lg">
              {sub}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <CtaPrimary href={primary.href} name={primary.label} location="hero">
                {primary.label}
              </CtaPrimary>
              {secondary ? (
                <CtaSecondary href={secondary.href} name={secondary.label} location="hero">
                  {secondary.label}
                </CtaSecondary>
              ) : null}
            </div>
            {status ? <div className="mt-6 text-sm text-secondary">{status}</div> : null}
          </div>
          {/*
            Ordered after the copy in the DOM, so the H1 is still the first thing
            a screen reader and a crawler meet, and the mockup is not competing
            with the LCP element for paint.
          */}
          {media ? <div className="lg:pl-4">{media}</div> : null}
        </div>
      </div>
    </section>
  );
}

/**
 * The three load-bearing facts, restated immediately under the hero.
 *
 * Deliberately **not** social proof. The honest version of a trust bar at this
 * stage is the commercial shape of the product — free for shoppers, a fee only
 * on a verified redemption, money moving in person — not a shop count or a
 * redemption total, which would be a measured figure and would have to go
 * through `ScenarioStat` (and would be modelled, not real, until BBS is live).
 *
 * `items` is passed in rather than hardcoded here so every value still resolves
 * from `lib/marketing/facts.ts` at the call site. No amber: this is context for
 * the CTA above it, and a second accent would compete with it.
 */
export function TrustBar({
  items,
}: {
  items: ReadonlyArray<{ title: React.ReactNode; body: React.ReactNode }>;
}) {
  return (
    <section className="bg-stone">
      <div className="mx-auto max-w-5xl px-5 pb-10 sm:pb-14">
        <dl className="grid animate-fade-in-up gap-4 sm:grid-cols-3 sm:gap-5">
          {items.map((item, i) => (
            <div key={i} className="rounded-card bg-white p-5 shadow-card">
              <dt className="text-base font-bold tracking-[-0.01em] text-ink">{item.title}</dt>
              <dd className="mt-1.5 text-[13px] leading-relaxed text-secondary">{item.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/**
 * The amber status dot beside a node status line.
 *
 * Renders nothing while `DEMO_MODE` holds (founder ruling 2026-08-10, drift
 * **D87**). The dot is a live-status indicator, so once the words "Live at" are
 * gated it would be the only thing left asserting the node is trading — and it
 * would assert it in colour alone, which frozen UI rule 4 forbids: state is an
 * icon *and* a word, readable in greyscale. Dropping the sentence and keeping
 * the dot moves the claim somewhere harder to audit rather than removing it.
 *
 * Suppressed here rather than at the six call sites so there is one switch, and
 * so a seventh call site cannot reintroduce the indicator by accident.
 */
export function LiveDot() {
  if (!SHOW_LIVE_INDICATOR) return null;
  return (
    <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-brand" />
  );
}

/**
 * The numbered-steps rail used on Home, Shoppers and Merchants. Numbers are
 * decorative to a screen reader — the ordered list already conveys sequence.
 */
export function StepRail({
  steps,
}: {
  steps: ReadonlyArray<{ title: string; body: React.ReactNode }>;
}) {
  return (
    <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <li
          key={s.title}
          className="rounded-card bg-white p-6 shadow-card transition hover:shadow-md"
        >
          <span
            aria-hidden="true"
            className="block text-4xl font-bold leading-none tracking-[-0.03em] text-muted"
          >
            {i + 1}
          </span>
          <h3 className="mt-3.5 text-lg font-bold tracking-[-0.01em] text-ink">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-secondary">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * The "four named points" pattern that recurs in every deck: a bolded claim
 * followed by a sentence of substantiation.
 */
export function PointGrid({
  points,
  columns = 2,
  tone = "dark",
}: {
  points: ReadonlyArray<{ title: string; body: React.ReactNode }>;
  columns?: 2 | 3;
  tone?: "dark" | "light";
}) {
  return (
    <dl
      className={`mt-10 grid gap-x-8 gap-y-7 ${
        columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"
      }`}
    >
      {points.map((p) => (
        <div key={p.title}>
          <dt className={`text-base font-bold ${tone === "light" ? "text-white" : "text-ink"}`}>
            {p.title}
          </dt>
          <dd
            className={`mt-1.5 text-sm leading-relaxed ${
              tone === "light" ? "text-white/70" : "text-secondary"
            }`}
          >
            {p.body}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * FAQ. Native `<details>` rather than a JS accordion: it is keyboard accessible
 * and expandable with no hydration, it is findable by in-page search even when
 * collapsed, and it works before JavaScript loads — which matters on mall wifi.
 */
export function FaqAccordion({
  items,
  page = "unknown",
}: {
  items: ReadonlyArray<{ q: string; a: React.ReactNode }>;
  /** Which page this accordion is on, so FAQ opens are comparable across pages. */
  page?: string;
}) {
  return (
    <div className="mt-10 divide-y divide-line border-y border-line">
      {items.map((item) => (
        <TrackedFaqItem key={item.q} question={item.q} page={page}>
          {item.a}
        </TrackedFaqItem>
      ))}
    </div>
  );
}

/** Full-width closing CTA. Dark, so the amber button carries the whole block. */
export function CtaBand({
  title,
  body,
  primary,
  secondary,
  reassurance,
}: {
  title: string;
  body?: React.ReactNode;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  reassurance?: React.ReactNode;
}) {
  return (
    <section className="bg-ink">
      <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <h2 className="max-w-3xl text-2xl font-black leading-tight text-white sm:text-3xl">
          {title}
        </h2>
        {body ? (
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70">{body}</p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <CtaPrimary href={primary.href} name={primary.label} location="cta-band">
            {primary.label}
          </CtaPrimary>
          {secondary ? (
            <CtaSecondary
              href={secondary.href}
              tone="light"
              name={secondary.label}
              location="cta-band"
            >
              {secondary.label}
            </CtaSecondary>
          ) : null}
        </div>
        {reassurance ? (
          <p className="mt-5 text-sm text-white/50">{reassurance}</p>
        ) : null}
      </div>
    </section>
  );
}
