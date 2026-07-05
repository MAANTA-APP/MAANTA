const INTASEND_BASE_URL =
  process.env.INTASEND_ENV === "live"
    ? "https://payment.intasend.com/api/v1"
    : "https://sandbox.intasend.com/api/v1";

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
