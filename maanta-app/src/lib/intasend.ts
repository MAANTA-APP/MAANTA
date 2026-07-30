const INTASEND_BASE_URL =
  process.env.INTASEND_ENV === "live"
    ? "https://payment.intasend.com/api/v1"
    : "https://sandbox.intasend.com/api/v1";

// Mirrors the STRIPE_ENV guard in stripe.ts: IntaSend keys embed the
// environment (ISPubKey_test_/ISPubKey_live_, ISSecretKey_test_/
// ISSecretKey_live_), so refuse to run when the key and INTASEND_ENV
// disagree rather than silently pointing a live key at the sandbox URL
// (or a test key at production).
//
// Returns the refusal reason, or null when the pair is usable. Split out from
// the assert so the capability check below can consult the SAME rule instead of
// duplicating it — the two disagreeing is what let a mismatched config offer a
// rail the money path would refuse.
export function keyEnvMismatch(publicKey: string, secretKey: string): string | null {
  const wantLive = process.env.INTASEND_ENV === "live";
  const hasLiveKey = publicKey.includes("_live_") || secretKey.includes("_live_");
  const hasTestKey = publicKey.includes("_test_") || secretKey.includes("_test_");

  if (!wantLive && hasLiveKey) {
    return 'INTASEND_ENV is not "live" but a live IntaSend key is configured. Refusing to run to avoid accidental real charges.';
  }
  if (wantLive && hasTestKey) {
    return 'INTASEND_ENV is "live" but a test IntaSend key is configured.';
  }
  return null;
}

function assertKeyMatchesEnv(publicKey: string, secretKey: string): void {
  const reason = keyEnvMismatch(publicKey, secretKey);
  if (reason) throw new Error(reason);
}

/** Warn once per process, so a misconfiguration is visible without log spam. */
let warnedAboutMismatch = false;

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
 *
 * "Usable" means more than "present". A key pair that disagrees with
 * `INTASEND_ENV` is refused by `assertKeyMatchesEnv` on the money path, so
 * counting it as configured offered the merchant a rail that could only fail:
 * the STK route would throw rather than return null, and the merchant would see
 * a broken primary action instead of the card rail that actually works. Both
 * checks now consult `keyEnvMismatch`, so the capability answer and the money
 * path cannot disagree.
 *
 * Fails closed by design — an unusable rail is not rendered at all.
 */
export function isMpesaTopupConfigured(): boolean {
  const publicKey = process.env.INTASEND_API_KEY;
  const secretKey = process.env.INTASEND_SECRET;
  if (!publicKey || !secretKey) return false;

  const mismatch = keyEnvMismatch(publicKey, secretKey);
  if (mismatch) {
    // Silence here would look identical to "no credentials", and an operator who
    // has just provisioned keys needs to know why the rail did not appear.
    if (!warnedAboutMismatch) {
      warnedAboutMismatch = true;
      console.warn(
        `[intasend] M-Pesa top-up is hidden: ${mismatch} Fix the key/INTASEND_ENV pair to enable the rail.`
      );
    }
    return false;
  }
  return true;
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
