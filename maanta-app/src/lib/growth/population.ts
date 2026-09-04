/**
 * Which population a Growth surface is counting — and the rule that it always
 * says so.
 *
 * MAANTA runs internal waitlist tests against the live signup form (the founder's
 * TEST treatment, 2026-09-04). That means every Growth figure is a count over one
 * of three populations, and a screen that does not state which one it used is a
 * screen whose number cannot be trusted. Pre-launch, with counts in the low
 * hundreds, a handful of smoke-test rows is not a rounding error — it is a
 * material fraction of the total.
 *
 * So the population is never an invisible default. `DEFAULT_POPULATION` is
 * `real`, and `POPULATION_CHIP` renders beside every figure that depends on it,
 * at every breakpoint. The design board states the rule as: "If it cannot fit,
 * the layout is wrong, not the chip."
 */

export const POPULATIONS = ["real", "test", "all"] as const;
export type Population = (typeof POPULATIONS)[number];

/**
 * Real only. A screenshot of this console must never be readable as MAANTA's
 * traction, and a default that quietly included internal test rows would be
 * exactly that (the same failure mode as `redemptions.is_demo` in D188 — a flag
 * nobody set, silently inflating a count).
 */
export const DEFAULT_POPULATION: Population = "real";

export function isPopulation(value: unknown): value is Population {
  return typeof value === "string" && (POPULATIONS as readonly string[]).includes(value);
}

/** Parse a `?population=` search param, falling back to Real rather than All. */
export function parsePopulation(value: unknown): Population {
  return isPopulation(value) ? value : DEFAULT_POPULATION;
}

/**
 * The persistent toolbar chip. Spelled out rather than abbreviated — "Real" on
 * its own does not tell an operator that something was excluded, and the
 * exclusion is the part that matters when the number is later quoted.
 */
export const POPULATION_CHIP: Record<Population, string> = {
  real: "Real only · TEST excluded",
  test: "TEST only · not real signups",
  all: "Real + TEST · mixed population",
};

/**
 * The footer sentence under a list. The toolbar chip says what is being counted;
 * this says it again where the rows are, so nobody has to look back up at the
 * toolbar to work out what they are reading.
 */
export const POPULATION_FOOTNOTE: Record<Population, string> = {
  real: "Test rows are hidden because the filter is set to Real.",
  test: "Only test rows are shown because the filter is set to Test.",
  all: "Test rows are shown because the filter is set to All.",
};

/**
 * A CSV taken with the filter on Real must contain no test rows, and the
 * filename has to record it. An export that quietly carries test data is how an
 * internal number reaches a real campaign — the same class of mistake D188
 * records on the redemption side.
 */
export function exportFilename(surface: string, population: Population, now: Date = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return `maanta-${surface}-${population}-${day}.csv`;
}

/** Does a row belong in this population? One predicate, every surface. */
export function inPopulation(isTest: boolean, population: Population): boolean {
  if (population === "all") return true;
  return population === "test" ? isTest : !isTest;
}
