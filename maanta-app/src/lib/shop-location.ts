/**
 * Where a shop is — the rules, in one module (D162, founder ruling 2026-08-24).
 *
 * Browser geolocation is the primary self-serve location method and the
 * coordinates it produces are MAANTA's canonical store location. what3words is
 * optional enrichment: it may fail, be over quota, or be absent entirely, and
 * none of that may block a merchant from finishing onboarding. That is the
 * whole point of the ruling — until it, a third party's billing state could
 * close the front door of the product.
 *
 * One module because the rule has three enforcement points that must not drift:
 * the wizard's location step, `/api/merchants/onboard`, and the SQL constraints
 * that back both (`merchants_location_present`, `merchants_lat_lng_range`).
 * The route is the real gate — the browser cannot be trusted about anything —
 * but a form that disagrees with the server only produces a 400 the merchant
 * standing in the mall cannot act on.
 *
 * FIELD PRINCIPLE. The objective is the shop entrance, not wherever the phone
 * happens to be. The merchant is expected to be at or immediately outside their
 * own door when they use "Locate my shop", the reading is taken only when they
 * ask for it (never continuously), and what is submitted is the position they
 * CONFIRMED — which may be a pin they dragged — not the phone's first guess.
 */

/**
 * Options for the one-shot position request.
 *
 * `maximumAge: 0` is deliberate: a cached fix from the merchant's kitchen this
 * morning is exactly the wrong answer, and the whole value of this flow is that
 * the reading is taken while they stand at the shop. `enableHighAccuracy` asks
 * for GPS rather than a coarse network fix. The timeout is generous because a
 * cold GPS lock inside a mall is slow, and a timeout here costs the merchant a
 * retry rather than the sign-up.
 */
export const GEOLOCATION_REQUEST_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 0,
};

/**
 * Above this radius the fix is too coarse to identify a shop unit, so the
 * merchant is warned and the manual pin is opened for them.
 *
 * 100 m is roughly the width of a mall: at worse than that the pin cannot
 * distinguish one entrance from another, which is the only thing it is for. It
 * is a prompt to correct the pin, never a refusal — dead-ending onboarding on a
 * poor GPS reading would recreate the defect this ruling exists to remove.
 */
export const SHOP_LOCATION_ACCURACY_WARN_M = 100;

export type ShopCoordinates = { lat: number; lng: number };

/**
 * Why a position request produced nothing. Each maps to a different thing the
 * merchant can do next, which is why they are not collapsed into one "failed".
 */
export type GeolocationFailureKind =
  | "unsupported"
  | "permission_denied"
  | "unavailable"
  | "timeout";

export function isValidLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * Both or neither, and both in range. Mirrors `merchants_lat_lng_pair` and
 * `merchants_lat_lng_range`; `Number.isFinite` rejects NaN and ±Infinity, which
 * a JSON body can carry as a string that coerces, and which Postgres would
 * otherwise reject as an opaque CHECK violation.
 */
export function isValidCoordinatePair(lat: unknown, lng: unknown): boolean {
  return isValidLatitude(lat) && isValidLongitude(lng);
}

/**
 * Read a coordinate a human typed or pasted. Returns null rather than NaN so a
 * half-typed "-" or "1." never reaches a comparison that silently passes.
 */
export function parseCoordinateInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Classify a `GeolocationPositionError` (or the absence of the API) without
 * depending on the DOM constants, which do not exist in a Node test run.
 * 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
 */
export function geolocationFailureKind(error: { code?: number } | null | undefined): GeolocationFailureKind {
  switch (error?.code) {
    case 1:
      return "permission_denied";
    case 3:
      return "timeout";
    case 2:
      return "unavailable";
    default:
      return "unavailable";
  }
}

/**
 * What the merchant reads. Literal, no blame, and every one of them ends at the
 * same place: the manual pin below is still open, so nothing here is a dead end.
 */
export function geolocationFailureMessage(kind: GeolocationFailureKind): string {
  switch (kind) {
    case "unsupported":
      return "This browser can't share a location. Place the pin on the map instead.";
    case "permission_denied":
      return "Location permission was declined. Allow it in your browser settings and try again, or place the pin on the map instead.";
    case "timeout":
      return "Couldn't get a location in time. Step outside the shop door and try again, or place the pin on the map instead.";
    case "unavailable":
    default:
      return "Your device couldn't determine a location. Try again, or place the pin on the map instead.";
  }
}

/** Whether a reading is precise enough to identify one shop entrance. */
export function isAccuracyAdequate(accuracyMetres: number | null | undefined): boolean {
  if (typeof accuracyMetres !== "number" || !Number.isFinite(accuracyMetres)) return true;
  return accuracyMetres <= SHOP_LOCATION_ACCURACY_WARN_M;
}

/**
 * Whether the location step may continue.
 *
 * Confirmation is a separate, explicit act: a position on screen is a proposal,
 * and the merchant is the only one who knows whether the pin is on their door.
 * A coarse reading does NOT block — it is warned about and the pin is opened —
 * because refusing to proceed is the failure mode this ruling removed.
 */
export function isLocationStepComplete({
  lat,
  lng,
  confirmed,
}: {
  lat: number | null;
  lng: number | null;
  confirmed: boolean;
}): boolean {
  return confirmed && isValidCoordinatePair(lat, lng);
}

/** Five decimals ≈ 1 m — enough to read back, short enough to fit a line. */
export function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

/** Accuracy as a plain distance: "12 m", "1.4 km". */
export function formatAccuracy(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return "unknown";
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/**
 * Where "Navigate" sends a shopper for a given shop.
 *
 * One rule, three surfaces (shop page, ticket, deal detail), because a shop is
 * no longer guaranteed to have three words: since D162 a coordinate-only shop
 * is a normal shop, and a page that assumed otherwise crashed on
 * `null.replace()`. what3words is preferred where it exists — it is the address
 * a shopper can read out at the mall — and the in-app map is the fallback.
 * Null means the shop has no usable location, which the DB now forbids on
 * creation but old or admin-edited rows could still carry.
 */
export function shopNavigationTarget(shop: {
  what3words_address: string | null;
  lat: number | null;
  lng: number | null;
}): { href: string; external: boolean } | null {
  if (shop.what3words_address) {
    return {
      href: `https://what3words.com/${shop.what3words_address.replace(/^\/+/, "")}`,
      external: true,
    };
  }
  if (isValidCoordinatePair(shop.lat, shop.lng)) {
    return { href: `/map?lat=${shop.lat}&lng=${shop.lng}`, external: false };
  }
  return null;
}
