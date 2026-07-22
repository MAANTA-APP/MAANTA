import { NextResponse } from "next/server";
import { requireMerchant } from "@/lib/merchant-api";
import { getStripeClient } from "@/lib/stripe";
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  isValidTopupAmount,
  MIN_TOPUP_AMOUNT,
  MAX_TOPUP_AMOUNT,
} from "@/lib/currency";
import {
  checkRateLimit,
  TOPUP_STRIPE_RATE_LIMIT,
  TOPUP_RATE_WINDOW_SECONDS,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  const auth = await requireMerchant("can_topup");
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;

  const { amount, currency = "KES" } = await request.json();
  if (!isValidTopupAmount(amount)) {
    return NextResponse.json(
      {
        error: `Amount must be a number between ${MIN_TOPUP_AMOUNT} and ${MAX_TOPUP_AMOUNT}.`,
      },
      { status: 400 }
    );
  }
  if (!isSupportedCurrency(currency)) {
    return NextResponse.json(
      { error: `Unsupported currency. Use one of: ${SUPPORTED_CURRENCIES.join(", ")}.` },
      { status: 400 }
    );
  }

  const allowed = await checkRateLimit(
    `topup-stripe:${merchant.id}`,
    TOPUP_STRIPE_RATE_LIMIT,
    TOPUP_RATE_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many checkout attempts — wait a moment and try again." },
      { status: 429 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      client_reference_id: merchant.id,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: `MAANTA balance top-up — ${merchant.merchant_name}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/merchant/topup?stripe=success`,
      cancel_url: `${appUrl}/merchant/topup?stripe=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Could not start Stripe checkout." },
        { status: 502 }
      );
    }

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);
    return NextResponse.json(
      { error: "Could not start Stripe checkout." },
      { status: 502 }
    );
  }
}
