import { redactFreeText, redactWebhookPayload } from "@/lib/redact";

const INTASEND_BASE_URL =
  process.env.INTASEND_ENV === "live"
    ? "https://payment.intasend.com/api/v1"
    : "https://sandbox.intasend.com/api/v1";

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
      // The provider echoes the request back on failure, including the
      // phone_number posted above, so the body is scrubbed before it reaches a
      // log. Free text has no keys to redact structurally — redactFreeText is
      // a shape heuristic, which is why the parsed path below uses the
      // key-aware redactor instead.
      console.error(
        "IntaSend STK push failed:",
        res.status,
        redactFreeText(await res.text())
      );
      return null;
    }

    const body = await res.json();
    const invoice = body?.invoice;
    const invoiceId = invoice?.invoice_id ?? invoice?.id;
    if (!invoiceId) {
      console.error(
        "IntaSend returned unexpected shape:",
        redactWebhookPayload(body)
      );
      return null;
    }

    return { invoiceId, state: invoice.state };
  } catch (err) {
    console.error("IntaSend STK push threw:", err);
    return null;
  }
}

export function verifyWebhookChallenge(challenge: unknown): boolean {
  const secret = process.env.INTASEND_WEBHOOK_SECRET;
  return Boolean(secret) && challenge === secret;
}
