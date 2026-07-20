import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAppUser } from "@/lib/auth";

export async function POST(request: Request) {
  const appUser = await ensureAppUser<{ id: string }>("id");
  if (!appUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const subscription = await request.json();
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  // RLS (users_own_row) already restricts this to the caller's own row —
  // no service-role client needed for a self-service field like this. The
  // Clerk token attached by createClient() satisfies current_user_id().
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
