import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { liveness, envPresence } from "@/lib/health";

// Node runtime: liveness reads process.uptime and the env-detail branch uses the
// admin guard (Clerk + Supabase). Never statically cached — always reflect the
// running process.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/healthz — liveness + (admin-gated) env presence.
 *
 *  - Default (no query): public liveness only. No auth, no DB, no secrets — safe
 *    for an uptime probe to poll.
 *  - `?detail=1` (or `?env=1`): additionally returns a boolean-only env-presence
 *    map, gated behind an admin session. Booleans only — never any secret value.
 *
 * Any non-GET method is 405 (Allow: GET).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wantDetail =
    url.searchParams.get("detail") === "1" || url.searchParams.get("env") === "1";

  const body: Record<string, unknown> = { ...liveness() };

  if (wantDetail) {
    // Env presence is operational detail — gate it behind an admin session. A
    // signed-out or non-admin caller still gets a 401/403 here, never the map.
    const auth = await requireAdminApi();
    if ("error" in auth) return auth.error;
    body.env = envPresence();
  }

  return NextResponse.json(body);
}

// POST/PUT/etc. — healthz is read-only.
export async function POST() {
  return new NextResponse(null, { status: 405, headers: { Allow: "GET" } });
}
