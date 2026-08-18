/** Narrow PostgREST / Postgres error shape used for schema probes. */
export type PostgrestLikeError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

/** True when PostgREST/Postgres rejects a select because merchants.lat/lng are absent. */
export function isMissingLatLngColumnError(error: PostgrestLikeError): boolean {
  const code = error.code ?? "";
  const blob =
    `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  const mentionsCoords = blob.includes("lat") || blob.includes("lng");
  if (!mentionsCoords) return false;
  if (code === "42703" || code === "PGRST204") return true;
  return (
    blob.includes("does not exist") ||
    blob.includes("schema cache") ||
    blob.includes("could not find")
  );
}

/**
 * True when PostgREST/Postgres rejects a select because `deals.category` is absent.
 *
 * The column arrives with `20260818120000_deal_categories.sql`, and Claude does
 * not apply migrations to production — so there is a window, of unknown length,
 * where this code is deployed against a database that has never heard of it.
 * Without this probe the shopper feed would 500 for that entire window, which is
 * a far worse outcome than a category filter that does not appear yet.
 *
 * Deliberately narrow: it matches only when the error text actually names the
 * column, so an unrelated failure is never mistaken for a schema gap and
 * silently retried.
 */
export function isMissingDealCategoryColumnError(error: PostgrestLikeError): boolean {
  const code = error.code ?? "";
  const blob =
    `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  if (!blob.includes("category")) return false;
  if (code === "42703" || code === "PGRST204") return true;
  return (
    blob.includes("does not exist") ||
    blob.includes("schema cache") ||
    blob.includes("could not find")
  );
}
