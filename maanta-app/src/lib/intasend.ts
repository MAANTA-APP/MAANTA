import { createHash, timingSafeEqual } from "node:crypto";

const INTASEND_BASE_URL =
  process.env.INTASEND_ENV === "live"
    ? "https://payment.intasend.com/api/v1"
    : "https://sandbox.intasend.com/api/v1";

/**
 * The one invoice state that means the money actually arrived.
 *
 * Declared here rather than inline at the webhook so the settled-vs-not
 * decision has exactly one definition. Every other state IntaSend can report
 * (PENDING, PROCESSING, FAILED, RETRY) means "do not credit anything".
 */
export const INTASEND_SETTLED_STATE = "COMPLETE";

/**
 * The non-settled states IntaSend is expected to report.
 *
 * Used only to decide whether a non-settled state is worth logging: these are
 * the normal lifecycle and are silent, anything else is surfaced. Deliberately
 * not used to *accept* a payment — settlement is `INTASEND_SETTLED_STATE` and
 * nothing else, so adding a state here can never make money move.
 */
export const INTASEND_KNOWN_UNSETTLED_STATES = new Set([
  "PENDING",
  "PROCESSING",
  "FAILED",
  "RETRY",
]);

/**
 * Ceiling on the status lookup, body included.
 *
 * The webhook blocks on this call, so an unbounded request turns a slow
 * IntaSend into a stalled handler and — once the platform kills it — a dropped
 * top-up with no ledger entry and no retry.
 */
const STATUS_TIMEOUT_MS = 10_000;

// Mirrors the STRIPE_ENV guard in stripe.ts: IntaSend keys embed the
// environment (ISPubKey_test_/ISPubKey_live_, ISSecretKey_test_/
// ISSecretKey_live_), so refuse to run when the key and INTASEND_ENV
// disagree rather than silently pointing a live key at the sandbox URL
// (or a test key at production).
function assertKeyMatchesEnv(publicKey: string, secretKey: string): void {
  const wantLive = process.env.INTASEND_ENV === "live";
  const hasLiveKey = publicKey.includes("_live_") || secretKey.includes("_live_");
  const hasTestKey = publicKey.includes("_test_") || secretKey.includes("_test_");

  if (!wantLive && hasLiveKey) {
    throw new Error(
      'INTASEND_ENV is not "live" but a live IntaSend key is configured. Refusing to run to avoid accidental real charges.'
    );
  }
  if (wantLive && hasTestKey) {
    throw new Error(
      'INTASEND_ENV is "live" but a test IntaSend key is configured.'
    );
  }
}

/**
 * Phase-1 honesty: M-Pesa STK is only offered when IntaSend keys exist.
 * Stripe Checkout remains the default top-up rail (sandbox during testing).
 * Do not treat STK as live just because the UI page exists.
 */
export function isIntasendConfigured(): boolean {
  return Boolean(process.env.INTASEND_API_KEY && process.env.INTASEND_SECRET);
}

export async function initiateMpesaStkPush(params: {
  amount: number;
  phoneNumber: string;
  apiRef: string;
  name: string;
  email: string;
}): Promise<{ invoiceId: string; state: string } | null> {
  const publicKey = process.env.INTASEND_API_KEY;
  const secretKey = process.env.INTASEND_SECRET;
  if (!publicKey || !secretKey) {
    console.error("IntaSend keys are not set");
    return null;
  }
  assertKeyMatchesEnv(publicKey, secretKey);

  try {
    const res = await fetch(`${INTASEND_BASE_URL}/payment/collection/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({
        public_key: publicKey,
        currency: "KES",
        method: "M-PESA",
        amount: params.amount,
        phone_number: params.phoneNumber,
        api_ref: params.apiRef,
        name: params.name,
        email: params.email,
      }),
    });

    if (!res.ok) {
      console.error("IntaSend STK push failed:", res.status, await res.text());
      return null;
    }

    const body = await res.json();
    const invoice = body?.invoice;
    const invoiceId = invoice?.invoice_id ?? invoice?.id;
    if (!invoiceId) {
      console.error("IntaSend returned unexpected shape:", body);
      return null;
    }

    return { invoiceId, state: invoice.state };
  } catch (err) {
    console.error("IntaSend STK push threw:", err);
    return null;
  }
}

/**
 * Constant-time equality for two secrets of unknown length.
 *
 * `timingSafeEqual` throws on a length mismatch, and guarding that with a
 * length check leaks the length — so hash both sides to a fixed 32 bytes first
 * and compare those. Equal-length inputs by construction, no early return, and
 * the comparison tells an attacker nothing about the secret's shape.
 */
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Authenticates the *caller*, and nothing more.
 *
 * IntaSend's webhook carries a plaintext shared secret in the body rather than
 * a signature over the payload, so a valid challenge proves only that whoever
 * sent this knows the secret — it says nothing about the amount, the merchant
 * or whether any money moved. That is why `verifyCollectionSettled` exists and
 * why the webhook route credits from *its* answer, never from the request body.
 * See drift row D59.
 */
export function verifyWebhookChallenge(challenge: unknown): boolean {
  const secret = process.env.INTASEND_WEBHOOK_SECRET;
  if (!secret || typeof challenge !== "string") return false;
  return secretsMatch(challenge, secret);
}

/** What IntaSend itself says about an invoice, normalised. */
export type IntasendInvoice = {
  invoiceId: string;
  state: string;
  /** Gross amount the payer was charged, in `currency`. Null when unparseable. */
  value: number | null;
  currency: string | null;
  /** The `api_ref` IntaSend recorded at STK-push time — the merchant binding. */
  apiRef: string | null;
  failedReason: string | null;
};

/**
 * `unavailable` is deliberately distinct from every other failure: it means we
 * could not establish the truth, not that the truth is "no". The caller must
 * retry rather than drop the payment on the floor.
 */
export type IntasendStatusResult =
  | { ok: true; invoice: IntasendInvoice }
  | { ok: false; reason: "unavailable" | "unexpected_shape"; detail: string };

function toFiniteNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ask IntaSend what actually happened to an invoice.
 *
 * `POST /payment/status/` with `{ public_key, invoice_id }`, per IntaSend's
 * collection API. This is the out-of-band confirmation that turns their webhook
 * from an *instruction* into a *notification*: the webhook says "look at this
 * invoice", and this call is the only thing allowed to say what it was worth
 * and who it belongs to.
 *
 * Every failure to reach or parse IntaSend returns `unavailable` — including a
 * key/env misconfiguration, which `assertKeyMatchesEnv` raises. That is
 * deliberate: an unreachable or misconfigured provider must make the caller
 * retry and alert, never silently conclude that a real top-up did not happen.
 * The one thing this function will not do is guess.
 */
export async function fetchCollectionStatus(
  invoiceId: string
): Promise<IntasendStatusResult> {
  const publicKey = process.env.INTASEND_API_KEY;
  const secretKey = process.env.INTASEND_SECRET;
  if (!publicKey || !secretKey) {
    return { ok: false, reason: "unavailable", detail: "IntaSend keys are not set." };
  }

  // The webhook cannot wait on IntaSend indefinitely — an unbounded lookup here
  // stalls the whole handler until the platform kills it, which turns a slow
  // provider into a dropped top-up. The timeout covers the response body too,
  // which is why the body is read inside the same try: an abort part-way
  // through reading must resolve to `unavailable` (retry) and not to
  // `unexpected_shape` (give up), since nothing is actually malformed.
  let rawBody: string;
  try {
    assertKeyMatchesEnv(publicKey, secretKey);
    const res = await fetch(`${INTASEND_BASE_URL}/payment/status/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({ public_key: publicKey, invoice_id: invoiceId }),
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "(unreadable body)");
      return {
        ok: false,
        reason: "unavailable",
        detail: `status lookup returned HTTP ${res.status}: ${errorBody.slice(0, 500)}`,
      };
    }

    rawBody = await res.text();
  } catch (err) {
    return {
      ok: false,
      reason: "unavailable",
      detail: `status lookup threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "unexpected_shape", detail: "status lookup returned non-JSON." };
  }

  const invoice = (parsed as { invoice?: Record<string, unknown> } | null)?.invoice;
  if (!invoice || typeof invoice !== "object") {
    return { ok: false, reason: "unexpected_shape", detail: "status response had no invoice object." };
  }

  const state = invoice.state;
  if (typeof state !== "string" || !state) {
    return { ok: false, reason: "unexpected_shape", detail: "status response had no invoice.state." };
  }

  return {
    ok: true,
    invoice: {
      invoiceId:
        typeof invoice.invoice_id === "string"
          ? invoice.invoice_id
          : typeof invoice.id === "string"
            ? invoice.id
            : invoiceId,
      state,
      value: toFiniteNumber(invoice.value),
      currency: typeof invoice.currency === "string" ? invoice.currency : null,
      apiRef: typeof invoice.api_ref === "string" ? invoice.api_ref : null,
      failedReason:
        typeof invoice.failed_reason === "string" ? invoice.failed_reason : null,
    },
  };
}
