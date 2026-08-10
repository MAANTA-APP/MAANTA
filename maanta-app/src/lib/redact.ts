/**
 * Redaction for anything written to a log or a diagnostic table.
 *
 * `payment_webhook_failures` exists so a failed credit is reviewable instead of
 * vanishing into ephemeral server logs. That makes it a place PII accumulates:
 * an IntaSend M-Pesa payload carries the payer's `phone_number`/`account`, and
 * the previous redactor removed exactly one key (`challenge`), so everything
 * else — including the number — was persisted verbatim. The rest of the
 * codebase masks phones before they leave the server (`phone-mask.ts`, applied
 * at every merchant-facing surface); this closes the one path that did not.
 *
 * **Allowlist, not denylist.** A denylist of PII-ish key names only redacts the
 * fields someone thought of, and a provider can add a field at any time. So the
 * default here is redact, and only a named set of diagnostic fields keeps its
 * value.
 *
 * **Keys are preserved, values are replaced.** Dropping unknown keys entirely
 * would hide the shape of an unfamiliar payload from the person debugging it,
 * which is the whole reason the table exists. Keeping the key and replacing the
 * value with `[REDACTED]` means an ops reviewer can still see which fields were
 * present and reason about a new failure mode, while no value they did not ask
 * for is stored.
 */

import { maskPhone } from "@/lib/phone-mask";

/**
 * Fields whose values are safe and useful to keep on a webhook failure row:
 * what the handler itself reads to route the credit, plus provider-side failure
 * diagnostics. Deliberately excludes `account` and `phone_number` (the payer's
 * number in IntaSend payloads), `challenge` (the shared secret), and any name
 * or email field.
 */
const DIAGNOSTIC_KEYS: ReadonlySet<string> = new Set([
  "state",
  "status",
  "api_ref",
  "invoice_id",
  "id",
  "provider",
  "currency",
  "value",
  "amount",
  "net_amount",
  "charges",
  "failed_reason",
  "failed_code",
  "event",
  "type",
  "object",
  "created_at",
  "updated_at",
]);

/**
 * Keys whose values are phone numbers. These are masked rather than fully
 * redacted: a masked number still lets a reviewer confirm they are looking at
 * the right payment without storing the number.
 *
 * Masking uses `lib/phone-mask.ts`, which is now the only masker in the
 * codebase. When this comment was first written that claim was false —
 * `lib/ui.ts` carried a second implementation that returned the number
 * completely unmasked for short inputs — so the two were consolidated rather
 * than leaving the claim to age into a lie. `lib/ui.ts` is a presentation
 * wrapper over this one now; only the mask character differs.
 */
const PHONE_KEYS: ReadonlySet<string> = new Set([
  "phone",
  "phone_number",
  "msisdn",
  "mobile",
  "account",
]);

const REDACTED = "[REDACTED]";

/** Depth cap. Guards against a pathological or self-referential payload. */
const MAX_DEPTH = 6;

function redactValue(key: string, value: unknown, depth: number): unknown {
  const normalisedKey = key.toLowerCase();

  if (PHONE_KEYS.has(normalisedKey)) {
    // maskPhone returns null for anything too short to mask without revealing
    // most of it — fall back to a full redaction rather than storing the raw
    // value, so an unmaskable number is never the leak.
    if (typeof value === "string" || typeof value === "number") {
      return maskPhone(String(value)) ?? REDACTED;
    }
    return REDACTED;
  }

  if (!DIAGNOSTIC_KEYS.has(normalisedKey)) {
    // Not diagnostic and not a known phone field: keep the key, drop the value.
    // Recurse into containers so a nested diagnostic field is not lost, but
    // stop at the depth cap.
    if (value !== null && typeof value === "object" && depth < MAX_DEPTH) {
      return redactContainer(value, depth + 1);
    }
    return value === null || value === undefined ? value : REDACTED;
  }

  if (value !== null && typeof value === "object" && depth < MAX_DEPTH) {
    return redactContainer(value, depth + 1);
  }

  // Fail CLOSED at the depth cap. An allowlisted key is allowlisted for its own
  // scalar value, not for an arbitrary subtree hanging off it: returning the
  // object here would emit it raw and unbounded, which is how a phone number
  // nested exactly MAX_DEPTH levels under `status` survived redaction. The
  // non-diagnostic and array branches already fail closed; this one did not.
  if (value !== null && typeof value === "object") return REDACTED;

  return value;
}

function redactContainer(input: object, depth: number): unknown {
  if (Array.isArray(input)) {
    return input.map((item) =>
      item !== null && typeof item === "object" && depth < MAX_DEPTH
        ? redactContainer(item, depth + 1)
        : item === null || item === undefined
          ? item
          : REDACTED
    );
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[key] = redactValue(key, value, depth);
  }
  return out;
}

/**
 * Redact a webhook payload before it is persisted or logged.
 *
 * Non-object input is returned untouched — there are no keys to reason about,
 * and a bare string body goes through `redactFreeText` instead.
 */
export function redactWebhookPayload(payload: unknown): unknown {
  if (payload === null || payload === undefined || typeof payload !== "object") {
    return payload;
  }
  return redactContainer(payload, 0);
}

/**
 * Scrub a free-text blob — a provider's raw error response, say — before it
 * reaches a log.
 *
 * This is a heuristic and is documented as one: with no keys to go on, the only
 * signal is shape, so it masks runs of 7+ digits (the shortest run that can be
 * a phone number, and long enough that amounts, ports and short ids are left
 * readable). It is a backstop for text that cannot be structurally redacted,
 * never the primary control — prefer `redactWebhookPayload` whenever the value
 * is parsed.
 */
export function redactFreeText(text: string): string {
  return text
    .replace(EMAIL_PATTERN, "[REDACTED]")
    .replace(SEPARATED_DIGITS, (run) => {
      const digits = run.replace(/\D/g, "");
      if (digits.length < 7) return run;
      return `${digits.slice(0, 2)}${"x".repeat(digits.length - 4)}${digits.slice(-2)}`;
    });
}

/**
 * Emails, because the STK-push request posts the merchant's address and the
 * provider echoes the request back on failure. Deliberately broad rather than
 * RFC-correct: over-matching in a log line costs nothing.
 */
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * Digit runs that may carry spaces, hyphens or dots between groups.
 *
 * A plain `\d{7,}` misses the formats this app actually sends — the top-up
 * route accepts "0712 345 678" and "+254-712-345-678", and `isValidKenyanPhone`
 * strips separators from a copy without normalising the value that goes to the
 * provider. Requiring a leading digit and allowing single separators between
 * digits catches those without swallowing ordinary prose.
 */
const SEPARATED_DIGITS = /\d(?:[\s.-]?\d){6,}/g;
