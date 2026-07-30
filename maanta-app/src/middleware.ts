import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest } from "next/server";
import { authStrategy } from "@/lib/auth/strategy";
import { updateSession } from "@/lib/supabase/middleware";

const clerkHandler = clerkMiddleware();

// Clerk populates auth() for the clerk strategy; Supabase Auth refreshes the
// session cookie for the supabase/authjs dev/test strategy.
export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent
) {
  const strategy = authStrategy();
  if (strategy === "supabase" || strategy === "authjs") {
    return updateSession(request);
  }
  return clerkHandler(request, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/(api|trpc)(.*)",
  ],
};
