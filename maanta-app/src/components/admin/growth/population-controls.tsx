import Link from "next/link";
import { cn } from "@/lib/ui";
import {
  POPULATIONS,
  POPULATION_CHIP,
  type Population,
} from "@/lib/growth/population";

/**
 * The population chip and its filter, shared by every Growth screen.
 *
 * **The chip is never responsive-hidden.** It renders at every breakpoint, and
 * if a toolbar cannot fit it the toolbar is wrong. A figure whose population is
 * only stated on desktop is a figure that gets screenshotted on a phone and
 * quoted without the qualifier — which is precisely how an internal test count
 * becomes a traction claim.
 *
 * Rust, not amber: this is a caution about what is being counted, and rule 5
 * says warning is rust `#9A4A0C` and never yellow. In the console amber is
 * already spoken for by the active sidebar item, so nothing here competes with it.
 */
export function PopulationChip({
  population,
  className,
}: {
  population: Population;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-pill border-[1.5px] border-rust bg-white px-3 py-1.5",
        className
      )}
    >
      {/* A square, not a dot: state is never carried by colour alone (rule 4),
          and the shape survives greyscale next to the round chips elsewhere. */}
      <span aria-hidden className="block h-1.5 w-1.5 rounded-[2px] bg-rust" />
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-rust">
        {POPULATION_CHIP[population]}
      </span>
    </span>
  );
}

const POPULATION_LABELS: Record<Population, string> = {
  real: "Real",
  test: "Test",
  all: "All",
};

/**
 * Real / Test / All, as links so the choice survives a reload and is shareable —
 * an operator quoting a number can send the URL that produced it.
 */
export function PopulationFilter({
  basePath,
  population,
  params,
  className,
}: {
  basePath: string;
  population: Population;
  /** Other search params to preserve when switching population. */
  params?: Record<string, string | undefined>;
  className?: string;
}) {
  const href = (next: Population) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) search.set(key, value);
    }
    search.set("population", next);
    return `${basePath}?${search.toString()}`;
  };

  return (
    <div
      className={cn(
        "inline-flex rounded-pill border-[1.5px] border-rust bg-white p-0.5",
        className
      )}
      role="group"
      aria-label="Which population to count"
    >
      {POPULATIONS.map((p) => (
        <Link
          key={p}
          href={href(p)}
          aria-current={p === population ? "true" : undefined}
          className={cn(
            "flex h-8 items-center justify-center rounded-pill px-3.5 text-[13px] font-semibold",
            p === population ? "bg-rust text-white" : "text-rust hover:bg-brand-tint"
          )}
        >
          {POPULATION_LABELS[p]}
        </Link>
      ))}
    </div>
  );
}
