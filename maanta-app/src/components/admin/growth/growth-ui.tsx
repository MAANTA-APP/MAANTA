import { cn } from "@/lib/ui";

/**
 * Small shared pieces for the Growth console.
 *
 * Two rules run through all of them:
 *
 * **Admin actions are ink, not amber.** In the console amber already means "the
 * sidebar item you are on". A second amber meaning inside the page would make
 * the one-amber-per-screen rule unresolvable, so buttons here are ink-filled and
 * amber survives only as the merchant data series and that active nav item.
 *
 * **Zero is a real answer.** Pre-launch, most conversion metrics are legitimately
 * zero, and an empty state that says "nothing yet, and that is expected" is
 * honest where a flat line looks like a broken chart.
 */

export function GrowthPageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2.5">{children}</div> : null}
    </div>
  );
}

export function GrowthCard({
  children,
  className,
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  /** `caution` outlines the card in rust — data quality, spend, anything to read twice. */
  tone?: "default" | "caution";
}) {
  return (
    <section
      className={cn(
        "rounded-card bg-white p-5",
        // Direction A: content cards are borderless white on shadow-card. A
        // caution card is the one exception — its rust edge IS the signal, and
        // it replaces the shadow rather than sitting on top of it.
        tone === "caution" ? "border-[1.5px] border-rust" : "shadow-card",
        className
      )}
    >
      {children}
    </section>
  );
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
      {children}
    </p>
  );
}

export function CardHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[17px] font-bold tracking-tight text-ink">{children}</h2>;
}

/**
 * A figure. Tabular numerals so a column of them does not jitter, and never
 * coloured — rule 3 keeps money uncoloured, and a count of people is read the
 * same way.
 */
export function Figure({
  value,
  suffix,
  className,
}: {
  value: string | number;
  suffix?: string;
  className?: string;
}) {
  return (
    <p className={cn("flex items-baseline gap-1.5", className)}>
      <span className="text-[34px] font-extrabold leading-none tracking-tight text-ink [font-variant-numeric:tabular-nums]">
        {value}
      </span>
      {suffix ? <span className="text-sm font-semibold text-muted">{suffix}</span> : null}
    </p>
  );
}

/** A label/number row inside a card's breakdown. */
export function StatRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "caution" | "error" | "good" | "muted";
}) {
  // Rule 4: an error is a border and a word, not red digits. Rust is a genuine
  // warning tone and stays on the value; flame moves to the row's left edge so
  // the figure itself remains #111 and legible in greyscale.
  const valueTone =
    tone === "caution"
      ? "text-rust"
      : tone === "good"
        ? "text-verified"
        : tone === "muted"
          ? "text-muted"
          : "text-ink";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        tone === "error" ? "border-l-2 border-flame pl-2" : undefined
      )}
    >
      <span className="text-xs text-muted">{label}</span>
      <span className={cn("font-mono text-xs font-semibold [font-variant-numeric:tabular-nums]", valueTone)}>
        {value}
      </span>
    </div>
  );
}

/**
 * "Nothing yet, and that is expected."
 *
 * Dashed rather than solid, and it states the reason. A bare zero in a column
 * reads as a bug or a missing feed; this reads as the pre-launch truth.
 */
export function ExpectedEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-line bg-white px-3 py-7 text-center">
      <span aria-hidden className="block h-6 w-6 rounded-lg border-[1.5px] border-dashed border-line" />
      <p className="text-xs font-medium leading-relaxed text-muted">{children}</p>
    </div>
  );
}

/**
 * A count that came from a capped or partial read.
 *
 * The register carries four rows (D244, D248, D254, D255) where a page quoted a
 * capped page as a live total. This component makes the honest version the easy
 * version: the figure renders with a "+" and the caption says what happened.
 */
export function PartialCount({ value, of }: { value: number; of: string }) {
  return (
    <span className="text-ink">
      {value}+{" "}
      <span className="text-xs font-normal text-rust">(partial read of {of})</span>
    </span>
  );
}

/** Rust/flame/neutral badge. Word plus colour — never colour alone (rule 4). */
export function GrowthBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "caution" | "error" | "good" | "test";
}) {
  const styles = {
    neutral: "border-line bg-stone text-secondary",
    caution: "border-brand-light bg-brand-tint text-rust",
    error: "border-flame bg-flame-tint text-ink",
    good: "border-verified-tint bg-verified-tint text-verified",
    test: "border-rust bg-rust text-white",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.06em]",
        styles
      )}
    >
      {children}
    </span>
  );
}
