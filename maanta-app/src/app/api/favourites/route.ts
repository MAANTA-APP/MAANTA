import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/** Toggle a saved shop (merchant_favourites — table existed with no route). */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { merchantId, on } = await request.json();
  if (!merchantId || typeof on !== "boolean") {
    return NextResponse.json({ error: "Missing merchantId/on." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: appUser } = await service
    .from("users")
    .select("id")
    .eq("auth_uid", authUser.id)
    .maybeSingle();
  if (!appUser) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  if (on) {
    const { error } = await service
      .from("merchant_favourites")
      .upsert(
        { user_id: appUser.id, merchant_id: merchantId },
        { onConflict: "user_id,merchant_id", ignoreDuplicates: true }
      );
    if (error) {
      return NextResponse.json({ error: "Could not save shop." }, { status: 500 });
    }
  } else {
    const { error } = await service
      .from("merchant_favourites")
      .delete()
      .eq("user_id", appUser.id)
      .eq("merchant_id", merchantId);
    if (error) {
      return NextResponse.json({ error: "Could not remove shop." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
