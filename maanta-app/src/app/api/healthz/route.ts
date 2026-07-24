import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { envHealth } from "@/lib/health";

/**
 * GET /api/healthz            → public liveness: { ok: true }. No env info.
 * GET /api/healthz?checks=1   → admin-only env self-check (booleans only,
 *                               never secret values) for ops to confirm the
 *                               running deployment's Supabase/Clerk/Stripe/
 *                               monitoring/analytics wiring. Reports only —
 *                               never mutates env.
 *
 * The detailed report is gated behind an admin session so the set of
 * configured integrations isn't disclosed publicly; the plain liveness ping
 * stays open for uptime checks.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("checks") !== "1") {
    return NextResponse.json({ ok: true });
  }

  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const report = envHealth();
  // 200 regardless of readiness — this is a report, not a gate. `ready` tells
  // the operator whether every non-optional integration is wired.
  return NextResponse.json({ ok: true, ...report });
}
