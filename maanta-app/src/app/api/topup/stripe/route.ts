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

export async function POST(request: Request) {
  // Owner-only, for the same reason as /api/topup (M-Pesa): wallet top-up is a
  // billing action, and staff are excluded by an explicit ownership check
  // rather than by an incidental owner-keyed lookup. can_topup is deliberately
  // not consulted. See docs/skills/merchant-staff-billing-reconciliation.md.
  const auth = await requireMerchant();
  if ("error" in auth) return auth.error;
  const { merchant, isOwner } = auth.ctx;
  if (!isOwner) {
    return NextResponse.json(
      { error: "Only the shop owner can top up the wallet." },
      { status: 403 }
    );
  }

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
