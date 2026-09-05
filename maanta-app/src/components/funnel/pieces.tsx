import Link from "next/link";
import { IconChevronDown } from "@/components/ui/icons";
import { cn } from "@/lib/ui";
import { inputClass } from "@/components/ui/inputs";

/** Two bars and a mono label — "Step 1 of 2". */
export function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <div className="flex flex-1 gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn("h-1 flex-1 rounded-[2px]", i < step ? "bg-ink" : "bg-line")}
          />
        ))}
      </div>
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        Step {step} of {total}
      </span>
    </div>
  );
}

/** "Shopper · change" — the role chosen on step 1, with the way back. */
export function RoleChip({ label, changeHref }: { label: string; changeHref: string }) {
  return (
    <span className="mb-3.5 inline-flex items-center gap-1.5 rounded-pill border border-line bg-stone px-2.5 py-1.5 text-[11px] font-semibold text-secondary">
      {label}
      <Link href={changeHref} className="font-medium underline underline-offset-2 hover:text-ink">
        change
      </Link>
    </span>
  );
}

/** A field label with the optional hint the board uses: "First name — optional". */
export function FieldLabel({
  children,
  hint,
  htmlFor,
}: {
  children: React.ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted">
      {children}
      {hint ? <span className="text-faint"> — {hint}</span> : null}
    </label>
  );
}

/** A native select in the shared field shell. Ink chevron, no custom menu. */
export function SelectField({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputClass, "appearance-none pr-10", className)} {...rest}>
        {children}
      </select>
      <IconChevronDown
        aria-hidden
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink"
      />
    </div>
  );
}

/**
 * The notice above the first field in test mode (M8). Rust border, ink body —
 * a warning tone, and never amber (the button keeps the amber).
 */
export function TestNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex gap-2.5 rounded-[14px] border-[1.5px] border-rust bg-white p-3.5">
      <span
        aria-hidden
        className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.8px] border-rust text-xs font-bold text-rust"
      >
        !
      </span>
      <div>
        <p className="text-sm font-bold leading-snug text-rust">Internal test mode</p>
        <p className="mt-1 text-[13px] leading-snug text-ink">
          {children ?? (
            <>
              Anything submitted here is tagged <code className="font-mono font-semibold">TEST</code>,
              kept out of every growth figure, and sends no message to the details entered.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/** The inline chip on the submit button in test mode: "[TEST] Submit test entry". */
export function TestChip() {
  return (
    <span className="mr-2 rounded-[4px] border border-black/60 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em]">
      Test
    </span>
  );
}
