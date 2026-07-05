import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const subscription = await request.json();
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  // RLS (users_own_row) already restricts this to the caller's own row —
  // no service-role client needed for a self-service field like this.
  const { error } = await supabase
    .from("users")
    .update({ push_subscription: subscription })
    .eq("auth_uid", user.id);

  if (error) {
    console.error("Failed to save push subscription:", error);
    return NextResponse.json(
      { error: "Could not save subscription." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
