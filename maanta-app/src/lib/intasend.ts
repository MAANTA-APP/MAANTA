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
 * Whether the M-Pesa (IntaSend) top-up rail is actually usable in this
 * deployment.
 *
 * Current reality (docs/notion-refresh/what-is-real-vs-staged-vs-planned.md):
 * **Stripe Checkout is the Phase 1 top-up rail; IntaSend M-Pesa is planned and
 * blocked externally on credentials.** IntaSend keys are optional in
 * `.env.example`, so on every environment that hasn't been granted credentials
 * this returns false — and the top-up screen must not present M-Pesa as the
 * primary action there. This reads the real env; it is not a feature flag and
 * cannot be flipped to fake a rail that isn't provisioned.
 */
export function isMpesaTopupConfigured(): boolean {
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

export function verifyWebhookChallenge(challenge: unknown): boolean {
  const secret = process.env.INTASEND_WEBHOOK_SECRET;
  return Boolean(secret) && challenge === secret;
}
