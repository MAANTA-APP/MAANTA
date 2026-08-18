import {
  isMissingDealCategoryColumnError,
  type PostgrestLikeError,
} from "@/lib/supabase/postgrest-errors";

type QueryResult<T> = { data: T | null; error: PostgrestLikeError | null };

/**
 * Everything in this module exists for one reason: `deals.category` arrives with
 * `20260818120000_deal_categories.sql`, and Claude never applies migrations to
 * production. Code that reads or writes the column therefore ships BEFORE the
 * column exists, for a window whose length is a human's decision, not this
 * code's. Every entry point that touches the column degrades through here, so
 * the missing column costs the category and nothing else.
 *
 * Delete this module — and the calls to it — once the migration is applied
 * everywhere. Until then, a plain `.select("... category ...")` anywhere is a
 * page that 500s on production.
 */

/**
 * Insert a deal, dropping `category` if the remote has not got the column yet.
 *
 * The read path degrades the same way (`selectDealsWithMerchants`), and for the
 * same reason: Claude never applies migrations to production, so every column
 * this code writes ships before the column exists, for a window nobody controls.
 * On the read side the cost of getting that wrong is a broken feed. On the write
 * side it is worse — a merchant who has already paid the wallet gate, uploaded a
 * cover and reached the last step of the wizard would be told "Could not publish
 * the deal", with no way to succeed, because of a column that has nothing to do
 * with publishing.
 *
 * So the category is the thing that gets dropped, never the deal. The deal
 * publishes uncategorised — the exact state every pre-taxonomy deal is already
 * in, and one the shopper surfaces already handle — and the console says why, so
 * the cause is a log line rather than a mystery.
 *
 * Retries ONLY on an error that names the category column. Every other failure
 * (the zero-balance gate, the deal limit, flash-on-Standard) is returned
 * untouched, so a real refusal can never be laundered into a second attempt.
 */
export async function insertDealDroppingUnknownCategory<T>(
  values: Record<string, unknown>,
  run: (values: Record<string, unknown>) => PromiseLike<QueryResult<T>>
): Promise<QueryResult<T>> {
  const first = await run(values);
  if (!first.error) return first;
  if (!("category" in values)) return first;
  if (!isMissingDealCategoryColumnError(first.error)) return first;

  console.error(
    "deals.category is absent on this database — publishing the deal uncategorised. Apply supabase/migrations/20260818120000_deal_categories.sql."
  );
  const withoutCategory = { ...values };
  delete withoutCategory.category;
  return run(withoutCategory);
}

/**
 * Run a select that names `category`, retrying without it if the column is not
 * there yet.
 *
 * `withoutCategory` is passed in rather than derived by string surgery: the
 * caller knows its own column list, and a regex that guesses at one would
 * eventually mangle a select in a way that only shows up in production.
 */
export async function selectDroppingUnknownCategory<T>(
  select: string,
  withoutCategory: string,
  run: (select: string) => PromiseLike<QueryResult<T>>
): Promise<QueryResult<T>> {
  const first = await run(select);
  if (!first.error) return first;
  if (!isMissingDealCategoryColumnError(first.error)) return first;
  return run(withoutCategory);
}
