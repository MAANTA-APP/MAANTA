/**
 * Sentry `beforeSend` scrubbing (SEC-010).
 *
 * The audit found no current code path that attaches a phone number or an OTP
 * to a Sentry event — every `captureException`/`captureMessage` call site passes
 * a constructed string. So this is defence in depth, not a fix for a live leak:
 * `instrumentation.ts` wires `Sentry.captureRequestError`, which auto-captures
 * unhandled route errors with request context, and one future
 * `captureException(err)` on a Postgres error whose `details` embeds a phone
 * number would ship it unfiltered.
 *
 * Three Sentry configs exist (server, edge, client) and all three need this, so
 * it lives here rather than being written out three times — a rule enforced in
 * three places is a rule that drifts in two of them.
 *
 * Scope, stated so it is not mistaken for more than it is: this scrubs known
 * sensitive KEYS in `request.data`/`request.headers`/`extra`/`contexts` and the
 * query string. It does not attempt to find secrets inside free-form exception
 * messages — see `redactFreeText` in `lib/redact.ts` for the heuristic used
 * where that matters.
 */

/** Keys whose values must never leave the process, at any nesting depth. */
const SENSITIVE_KEY = /^(otp|otp_?code|token|access_?token|refresh_?token|authorization|auth|cookie|password|secret|api_?key|challenge|signature|phone|phone_?number|msisdn)$/i;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;

function scrubValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object" || depth >= MAX_DEPTH) return value;

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrubValue(inner, depth + 1);
  }
  return out;
}

/**
 * Scrub an event before Sentry transmits it.
 *
 * Returns the scrubbed event, or **null to discard it entirely** if anything
 * about the event's shape defeats the scrubber. Sentry treats a null return
 * from `beforeSend` as "drop this event", and dropping one error report is the
 * right trade against transmitting a payload we could not inspect.
 *
 * Never throws. A `beforeSend` that throws takes out error reporting for the
 * whole process, which is worse than either outcome above. Note the fallback
 * cannot be "blank the fields and send anyway": assigning to a property whose
 * descriptor has no setter throws again, from inside the catch — a trap this
 * function's own test exercises.
 */
export function scrubEvent<T extends object>(event: T): T | null {
  try {
    // Index through a Record view: the generic is only there so callers get
    // their own event type back, not to describe the keys we touch.
    const target = event as Record<string, unknown>;

    const request = target.request as Record<string, unknown> | undefined;
    if (request) {
      if (request.data !== undefined) request.data = scrubValue(request.data, 0);
      if (request.headers !== undefined) {
        request.headers = scrubValue(request.headers, 0);
      }
      if (request.cookies !== undefined) request.cookies = REDACTED;
      // Query strings carry the same values as a body on a GET.
      if (typeof request.query_string === "string") {
        request.query_string = scrubQueryString(request.query_string);
      }
    }

    if (target.extra !== undefined) target.extra = scrubValue(target.extra, 0);
    if (target.contexts !== undefined) {
      target.contexts = scrubValue(target.contexts, 0);
    }
    return event;
  } catch {
    return null;
  }
}

function scrubQueryString(query: string): string {
  return query
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      const key = pair.slice(0, eq);
      return SENSITIVE_KEY.test(decodeURIComponent(key)) ? `${key}=${REDACTED}` : pair;
    })
    .join("&");
}
