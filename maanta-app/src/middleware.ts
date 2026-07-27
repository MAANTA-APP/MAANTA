import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

function middlewareStrategy(): string {
  return (
    process.env.MAANTA_AUTH_STRATEGY?.trim() ||
    process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY?.trim() ||
    "clerk"
  );
}

const clerkHandler = clerkMiddleware();

// Clerk populates auth() for the clerk strategy; Supabase Auth refreshes the
// session cookie for the supabase/authjs dev/test strategy.
export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent
) {
  if (middlewareStrategy() === "supabase" || middlewareStrategy() === "authjs") {
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
