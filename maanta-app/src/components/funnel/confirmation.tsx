import { IconCheck, IconX } from "@/components/ui/icons";
import { cn } from "@/lib/ui";

/**
 * The confirmation frame (board 2, M7). A tinted band with an icon, the
 * headline and one sentence; then whatever the state needs to say next.
 *
 * Error tone follows frozen rule 4: the band and the icon are flame, the body
 * text stays ink. The board wrote the error lede in flame; the rule says no.
 */
export function ConfirmationPanel({
  tone,
  title,
  lede,
  children,
}: {
  tone: "success" | "error";
  title: string;
  lede: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section aria-live="polite" className="-mx-5 lg:mx-0 lg:overflow-hidden lg:rounded-card lg:shadow-card">
      <div
        className={cn(
          "px-5 pb-6 pt-8 lg:px-8",
          tone === "success" ? "bg-verified-tint" : "bg-flame-tint"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-2xl",
            tone === "success" ? "bg-verified text-white" : "border-2 border-flame bg-white text-flame"
          )}
        >
          {tone === "success" ? <IconCheck className="h-6 w-6" /> : <IconX className="h-6 w-6" />}
        </span>
        <h1 className="text-balance text-[30px] font-extrabold leading-[1.08] tracking-[-0.034em] text-ink">
          {title}
        </h1>
        <p className="mt-2.5 text-base leading-relaxed text-ink">{lede}</p>
      </div>
      {children ? <div className="bg-white px-5 py-6 lg:px-8">{children}</div> : null}
    </section>
  );
}

/** Mono eyebrow over a block — "What happens next". */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
      {children}
    </p>
  );
}

/** Numbered steps, ink circles. */
export function NumberedSteps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink font-mono text-[11px] font-bold text-ink"
          >
            {i + 1}
          </span>
          <p className="text-[15px] leading-relaxed text-ink">{item}</p>
        </li>
      ))}
    </ol>
  );
}

/** Two-column facts: "Number · +254 7·· ··· 4·2". */
export function FactRows({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line rounded-[14px] border border-line">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-[13px] text-muted">{row.label}</dt>
          <dd className="text-[14px] font-semibold text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A quiet box for the secondary thing — "Know a shop that should be on this?" */
export function Callout({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[16px] bg-stone p-4">{children}</div>;
}

/**
 * `+254712345642` → `+254 7·· ··· 6·2`. What the person typed, shown back
 * without printing it: enough to recognise their own number, not enough to
 * read someone else's off a shoulder.
 */
export function maskPhone(e164: string): string {
  const m = /^(\+\d{1,3})(\d+)$/.exec(e164.replace(/\s+/g, ""));
  if (!m) return "your number";
  const [, cc, rest] = m;
  if (rest.length < 4) return `${cc} ···`;
  const last = rest.slice(-3);
  return `${cc} ${rest[0]}·· ··· ${last[0]}·${last[2]}`;
}
