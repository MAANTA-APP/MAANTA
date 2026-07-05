import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const {
    merchantName,
    mallName,
    floor,
    unitNumber,
    what3wordsAddress,
    phone,
    email,
    whatsapp,
  } = await request.json();

  if (!merchantName || !what3wordsAddress || !phone) {
    return NextResponse.json(
      { error: "Shop name, what3words address, and phone are required." },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const { data: appUser } = await service
    .from("users")
    .select("id, role")
    .eq("auth_uid", authUser.id)
    .maybeSingle();

  if (!appUser) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const { data: existingMerchant } = await service
    .from("merchants")
    .select("id")
    .eq("user_id", appUser.id)
    .maybeSingle();

  if (existingMerchant) {
    return NextResponse.json(
      { error: "You've already onboarded a shop." },
      { status: 409 }
    );
  }

  const { data: merchant, error } = await service
    .from("merchants")
    .insert({
      user_id: appUser.id,
      merchant_name: merchantName,
      mall_name: mallName || null,
      floor: floor || null,
      unit_number: unitNumber || null,
      what3words_address: what3wordsAddress,
      phone,
      email: email || null,
      whatsapp: whatsapp || null,
      onboarding_mode: "self_serve",
    })
    .select("id")
    .single();

  if (error || !merchant) {
    console.error("Failed to create merchant:", error);
    return NextResponse.json(
      { error: "Could not complete onboarding. Please try again." },
      { status: 500 }
    );
  }

  // Role change is done here (privileged, service-role) rather than letting
  // the client update its own row — the users_own_row RLS policy has no
  // WITH CHECK restricting which columns/values a user can set on
  // themselves, so a client-side role update would work but relies on an
  // unrelated gap rather than validated server logic.
  if (appUser.role === "customer") {
    await service
      .from("users")
      .update({ role: "merchant_admin" })
      .eq("id", appUser.id);
  }

  return NextResponse.json({ merchantId: merchant.id });
}
