const W3W_CONVERT_TO_COORDS = "https://api.what3words.com/v3/convert-to-coordinates";
const W3W_CONVERT_TO_3WA = "https://api.what3words.com/v3/convert-to-3wa";

const W3W_REGEX = /^\/{0,3}([a-z]+\.[a-z]+\.[a-z]+)$/i;

export type W3wCoordsSuccess = {
  ok: true;
  words: string;
  lat: number;
  lng: number;
  nearestPlace: string | null;
};

export type W3wCoordsFailure = {
  ok: false;
  error: string;
  /**
   * `not_found` means what3words looked and there is no such address — the
   * three words are wrong, and telling the person to check them is correct.
   *
   * `upstream_rejected` means the CALL failed: a non-2xx from what3words
   * (bad/expired/over-quota key, a 4xx on our request shape, a 5xx on theirs).
   * The person's input may be perfect. Conflating the two — which this module
   * did until 2026-08-23 — makes a broken integration look like operator error:
   * every address, including what3words' own canonical `filled.count.soap`,
   * came back "check the three words and try again" while the real cause was
   * invisible because the branch logged nothing. Keep them separate.
   */
  code:
    | "missing_key"
    | "invalid_format"
    | "not_found"
    | "upstream_rejected"
    | "upstream"
    | "unexpected";
};

export type W3wCoordsResult = W3wCoordsSuccess | W3wCoordsFailure;

export type W3wWordsSuccess = {
  ok: true;
  words: string;
  lat: number;
  lng: number;
};

export type W3wWordsFailure = {
  ok: false;
  error: string;
  code:
    | "missing_key"
    | "invalid_coords"
    | "upstream_rejected"
    | "upstream"
    | "unexpected";
};

export type W3wWordsResult = W3wWordsSuccess | W3wWordsFailure;

export function normalizeWhat3Words(raw: string): string | null {
  const match = raw.trim().toLowerCase().match(W3W_REGEX);
  return match ? match[1] : null;
}

function apiKey(): string | null {
  return process.env.W3W_API_KEY || null;
}

/**
 * Default ceiling on any call to what3words.
 *
 * Every request here previously ran unbounded — `await fetch(url)` with no
 * signal — so a slow or unreachable provider held the calling serverless
 * invocation until the platform killed it. On the claim path that turned a
 * committed claim into a non-JSON 504 and, to the shopper, a bogus network
 * error. A third party must never be able to consume a whole invocation:
 * see docs/ops/claim-failure-investigation-2026-08-14.md.
 *
 * Generous enough for interactive validation (merchant onboarding, `/api/w3w`);
 * the claim path passes something much tighter, because there the lookup is
 * enrichment and the shopper is waiting on a ticket.
 */
export const W3W_DEFAULT_TIMEOUT_MS = 5000;

/** Timeout for the claim-path geofence lookup — enrichment, not the answer. */
export const W3W_CLAIM_TIMEOUT_MS = 1500;

/**
 * A signal that aborts after `ms`, by whichever mechanism the runtime offers.
 *
 * **Why this is not simply `AbortSignal.timeout(ms)`.** That method is the
 * right primitive and exists in Node 18+, but this repository does not pin the
 * runtime that actually serves production: there is no `engines` field in
 * `package.json`, no `.nvmrc`, no `.node-version` and no `vercel.json`. CI pins
 * Node 20, and that governs GitHub Actions only. The deployed version is a
 * dashboard setting, invisible from here.
 *
 * A bare feature check would therefore have failed *open* on the one thing this
 * helper exists to prevent — an unbounded call on the claim path — and it would
 * have failed silently, because no test can observe a runtime the repository
 * cannot name. So the fallback is real rather than a degradation:
 * `AbortController` plus `setTimeout` is available in every runtime that has
 * `fetch` at all, and it produces the same observable behavior.
 *
 * `undefined` is returned only if a runtime has neither, which would mean it
 * also has no `fetch` — at which point the call fails on its own terms.
 *
 * One accepted cost in the fallback path: the timer is not cleared when the
 * request finishes first, so it survives at most `ms` past a fast response.
 * `unref()` is called where supported so it can never hold a process open, and
 * the longest timer here is 5 seconds.
 */
export function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }

  if (typeof AbortController !== "function") return undefined;

  const controller = new AbortController();
  const timer: unknown = setTimeout(() => controller.abort(), ms);
  // Node timers can be unref'd so a pending abort never keeps the process
  // alive; browser timers are plain numbers and simply skip this.
  if (timer && typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }
  return controller.signal;
}

/**
 * Convert a 3-word address to WGS84 coordinates.
 * Server-only — reads W3W_API_KEY. Never call from client components.
 *
 * An abort surfaces as `upstream`, the same as any other provider failure —
 * callers already treat that as non-fatal, and the distinction is a server-log
 * concern, not a caller concern.
 */
export async function convertToCoordinates(
  w3w: string,
  timeoutMs: number = W3W_DEFAULT_TIMEOUT_MS
): Promise<W3wCoordsResult> {
  const words = normalizeWhat3Words(w3w);
  if (!words) {
    return {
      ok: false,
      code: "invalid_format",
      error: "Enter a 3-word address like ///stove.cactus.rally",
    };
  }

  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      code: "missing_key",
      error: "Address validation is temporarily unavailable.",
    };
  }

  try {
    const url = new URL(W3W_CONVERT_TO_COORDS);
    url.searchParams.set("words", words);
    url.searchParams.set("key", key);
    const res = await fetch(url.toString(), { signal: timeoutSignal(timeoutMs) });
    const body = await res.json().catch(() => null);

    // A non-2xx is the provider refusing US, not the person mistyping. Log the
    // status and what3words' own error code (never the key, never the address —
    // D85: addresses are PII) so a broken integration is diagnosable from the
    // function logs instead of looking like a stream of bad addresses.
    if (!res.ok) {
      console.error("what3words convert-to-coordinates rejected", {
        status: res.status,
        w3wCode: body?.error?.code ?? null,
        w3wMessage: body?.error?.message ?? null,
      });
      return {
        ok: false,
        code: "upstream_rejected",
        error: "Address checking is temporarily unavailable — try again shortly.",
      };
    }

    // 2xx but no coordinates: what3words looked and found nothing. The three
    // words really are wrong, so blaming the input here is correct.
    if (typeof body?.coordinates?.lat !== "number") {
      return {
        ok: false,
        code: "not_found",
        error: "That address didn't resolve — check the three words and try again.",
      };
    }

    return {
      ok: true,
      words,
      lat: body.coordinates.lat,
      lng: body.coordinates.lng,
      nearestPlace:
        typeof body.nearestPlace === "string" ? body.nearestPlace : null,
    };
  } catch (err) {
    console.error("what3words convertToCoordinates threw:", err);
    return {
      ok: false,
      code: "upstream",
      error: "Could not reach what3words. Try again.",
    };
  }
}

/**
 * Convert WGS84 coordinates to a 3-word address.
 * Server-only — reads W3W_API_KEY.
 *
 * Bounded like its sibling. This direction ran unbounded until D162 put it on
 * the onboarding path as best-effort enrichment: an unreachable provider would
 * then have held the whole invocation open, which is the failure this module's
 * timeout note exists to prevent. Callers that are merely decorating a record
 * (merchant onboarding) pass something much tighter than the interactive
 * default, because there nobody is waiting on the words.
 */
export async function convertTo3Words(
  lat: number,
  lng: number,
  timeoutMs: number = W3W_DEFAULT_TIMEOUT_MS
): Promise<W3wWordsResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return {
      ok: false,
      code: "invalid_coords",
      error: "Latitude and longitude look invalid.",
    };
  }

  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      code: "missing_key",
      error: "Address lookup is temporarily unavailable.",
    };
  }

  try {
    const url = new URL(W3W_CONVERT_TO_3WA);
    url.searchParams.set("coordinates", `${lat},${lng}`);
    url.searchParams.set("key", key);
    const res = await fetch(url.toString(), { signal: timeoutSignal(timeoutMs) });
    const body = await res.json().catch(() => null);

    // Same split as convert-to-coordinates: a refusal is ours to fix, not the
    // caller's. This direction is best-effort (the coordinates are already
    // usable without the words), so it stays non-fatal either way — but it is
    // logged, because a silently dead provider is what made this hard to find.
    if (!res.ok) {
      console.error("what3words convert-to-3wa rejected", {
        status: res.status,
        w3wCode: body?.error?.code ?? null,
        w3wMessage: body?.error?.message ?? null,
      });
      return {
        ok: false,
        code: "upstream_rejected",
        error: "Address lookup is temporarily unavailable.",
      };
    }

    if (typeof body?.words !== "string") {
      return {
        ok: false,
        code: "unexpected",
        error: "Could not resolve those coordinates to a 3-word address.",
      };
    }

    return {
      ok: true,
      words: body.words,
      lat: typeof body?.coordinates?.lat === "number" ? body.coordinates.lat : lat,
      lng: typeof body?.coordinates?.lng === "number" ? body.coordinates.lng : lng,
    };
  } catch (err) {
    console.error("what3words convertTo3Words threw:", err);
    return {
      ok: false,
      code: "upstream",
      error: "Could not reach what3words. Try again.",
    };
  }
}

/**
 * Claim-geofence helper — returns null on any failure, including a timeout.
 *
 * Bounded by `W3W_CLAIM_TIMEOUT_MS` rather than the interactive default: on the
 * claim path this is enrichment behind an already-committed redemption, so a
 * slow provider must cost the shopper a missing distance figure, never their
 * ticket. Every failure mode — timeout, provider down, malformed body, missing
 * key — collapses to `null` and is logged server-side with the reason code
 * only; the address and the shopper's coordinates are never logged.
 */
export async function convertWhat3WordsToCoordinates(
  words: string,
  timeoutMs: number = W3W_CLAIM_TIMEOUT_MS
): Promise<{ lat: number; lng: number } | null> {
  const result = await convertToCoordinates(words, timeoutMs);
  if (!result.ok) {
    console.error("what3words lookup unavailable:", { code: result.code });
    return null;
  }
  return { lat: result.lat, lng: result.lng };
}

/** Great-circle distance in meters between two lat/lng points (Haversine). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Human-readable distance for deal cards ("120 m" / "1.2 km"). */
export function formatDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}
