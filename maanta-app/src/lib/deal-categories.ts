import type { DealRow } from "@/lib/data";

/**
 * The shopper-facing deal taxonomy — three buckets, founder-locked 2026-08-18.
 *
 * Two things are deliberately separate here and must stay separate:
 *
 *   * `key` is what the database stores and what `?category=` carries. It is a
 *     stable identifier, not an abbreviation of the label — `fashion` keeps
 *     meaning the same bucket even if the words on the chip change, and a stored
 *     row never has to be rewritten to reword a label.
 *   * `label` is copy. It can be edited by anyone with taste; the key cannot be
 *     edited by anyone without a migration.
 *
 * Storing the label would have collapsed the two, which is how a copy tweak
 * turns into a silent data migration and every old deal falls out of its own
 * category.
 *
 * This is also the whole list. Adding a fourth bucket is: one entry here, one
 * value in the SQL CHECK constraint, one line in the migration that widens it.
 * The app derives everything else — chips, validation, the merchant picker — from
 * this array, so nothing else has to be found and edited.
 *
 * Categories are attached to the DEAL, not the merchant (founder ruling
 * 2026-08-18). A fabric shop that sells snacks at the counter can file each deal
 * where a shopper would look for it, and a merchant changing what they sell does
 * not silently re-file every deal they have ever run.
 */
export const DEAL_CATEGORIES = [
  { key: "fashion", label: "Fashion & fabric" },
  { key: "beauty", label: "Beauty & perfume" },
  { key: "food", label: "Food" },
] as const;

export type DealCategory = (typeof DEAL_CATEGORIES)[number]["key"];

/** `"all"` is the absence of a filter, never a stored value. */
export type DealCategoryFilter = DealCategory | "all";

const KEYS: readonly string[] = DEAL_CATEGORIES.map((c) => c.key);

export function isDealCategory(raw: unknown): raw is DealCategory {
  return typeof raw === "string" && KEYS.includes(raw);
}

export function dealCategoryLabel(key: string | null | undefined): string | null {
  return DEAL_CATEGORIES.find((c) => c.key === key)?.label ?? null;
}

/**
 * Resolve a raw `?category=` value.
 *
 * Same defence as `parseDealListFilter`: an unrecognised value must mean "no
 * filter", not "a filter nothing matches". A stale link or a typo that emptied
 * the feed would render "No deals live right now" on a mall that has deals —
 * telling a shopper the market is empty because a URL was wrong.
 */
export function parseDealCategory(
  raw: string | string[] | undefined | null
): DealCategoryFilter {
  if (typeof raw !== "string") return "all";
  return isDealCategory(raw) ? raw : "all";
}

/**
 * Filter a list of deals by category.
 *
 * Uncategorised deals (`category IS NULL`) appear only under "All". They are not
 * folded into a default bucket: every existing deal predates the column, and
 * quietly filing them under one category would put a fabric deal in Food and
 * make the filter lie. The merchant wizard requires a category for anything new,
 * so this set only shrinks.
 */
export function filterDealRowsByCategory<T extends { category?: string | null }>(
  deals: T[],
  filter: DealCategoryFilter
): T[] {
  if (filter === "all") return deals;
  return deals.filter((d) => d.category === filter);
}

/**
 * The categories that actually have a live deal behind them, in taxonomy order.
 *
 * The chip row renders from this rather than from `DEAL_CATEGORIES`, so a chip
 * is never offered that leads to an empty feed. It is also what makes this
 * feature safe to ship before the migration is applied: with no `category`
 * column the reads return `undefined` for every row, this returns `[]`, and the
 * chip row does not render at all — the feed is exactly what it is today instead
 * of a row of chips that all empty the screen.
 */
export function availableDealCategories(
  deals: { category?: string | null }[]
): readonly { key: DealCategory; label: string }[] {
  const present = new Set(deals.map((d) => d.category).filter(isDealCategory));
  return DEAL_CATEGORIES.filter((c) => present.has(c.key));
}

/** Convenience for surfaces holding `DealRow`s specifically. */
export function filterDealsByCategory(
  deals: DealRow[],
  filter: DealCategoryFilter
): DealRow[] {
  return filterDealRowsByCategory(deals, filter);
}

/**
 * The chip row's contents, or an empty list meaning "render nothing".
 *
 * A filter that cannot change what is on screen is noise, so the row is
 * withheld when every visible deal sits in the same bucket — including the case
 * where that bucket is "uncategorised" and no chip could be offered at all.
 * Uncategorised deals count as their own bucket for this test: with one Food
 * deal and one uncategorised deal, "Food" genuinely narrows, so the row earns
 * its space.
 *
 * MUST be computed from the unfiltered set. Derive it from the filtered list
 * and picking "Food" removes every other chip, stranding the shopper on a
 * filter they can no longer leave except by editing the URL.
 */
export function dealCategoryChips(
  allDeals: { category?: string | null }[]
): readonly { key: DealCategory; label: string }[] {
  const available = availableDealCategories(allDeals);
  if (available.length === 0) return [];
  const oneBucket = allDeals.every((d) => d.category === available[0].key);
  return oneBucket ? [] : available;
}
