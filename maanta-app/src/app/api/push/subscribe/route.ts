import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAppUser } from "@/lib/auth";
import { parsePushSubscription } from "@/lib/push-subscription";

export async function POST(request: Request) {
  const appUser = await ensureAppUser<{ id: string }>("id");
  if (!appUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const raw = await request.json().catch(() => null);
  const subscription = parsePushSubscription(raw);
  if (!subscription) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("users")
    .update({ push_subscription: subscription })
    .eq("id", appUser.id);

  if (error) {
    console.error("Failed to save push subscription:", error);
    return NextResponse.json(
      { error: "Could not save subscription." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
