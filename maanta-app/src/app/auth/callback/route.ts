import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppOrigin, PRODUCTION_APP_ORIGIN } from "@/lib/app-url";

/** OAuth / magic-link callback for Supabase Auth (dev/test strategy). */
export async function GET(request: Request) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/select-mall";
  const next = nextRaw.startsWith("/") ? nextRaw : "/select-mall";
  // Prefer canonical app origin so production never redirects to localhost
  // even if the callback was hit via a misconfigured email link host.
  const origin = getAppOrigin() ?? requestOrigin ?? PRODUCTION_APP_ORIGIN;

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
