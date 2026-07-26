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
