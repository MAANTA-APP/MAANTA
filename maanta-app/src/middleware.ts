import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk owns the session now, so the middleware just runs clerkMiddleware to
// populate auth() for downstream server code. Route gating stays where it was
// (per-page redirects and per-route 401s) rather than being centralised here,
// preserving the existing shopper/merchant/admin/agent access behaviour.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static assets, run on everything else + APIs.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/(api|trpc)(.*)",
  ],
};
