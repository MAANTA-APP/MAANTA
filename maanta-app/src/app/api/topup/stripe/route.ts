import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripeClient } from "@/lib/stripe";
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  isValidTopupAmount,
  MIN_TOPUP_AMOUNT,
  MAX_TOPUP_AMOUNT,
} from "@/lib/currency";

const MERCHANT_ROLES = ["merchant_admin", "merchant_staff"];

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
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

  const service = createServiceClient();

  const { data: appUser } = await service
    .from("users")
    .select("id, role")
    .eq("auth_uid", authUser.id)
    .maybeSingle();

  if (!appUser || !MERCHANT_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { data: merchant } = await service
    .from("merchants")
    .select("id, merchant_name")
    .eq("user_id", appUser.id)
    .maybeSingle();

  if (!merchant) {
    return NextResponse.json(
      { error: "No merchant account found." },
      { status: 404 }
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
