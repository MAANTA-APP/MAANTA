import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { liveness, envPresence, probeSupabase, readiness } from "@/lib/health";

// Node runtime: liveness reads process.uptime and the env-detail branch uses the
// admin guard (Clerk + Supabase). Never statically cached — always reflect the
// running process.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/healthz — liveness + readiness + (admin-gated) env / Supabase probe.
 *
 *  - Default (no query): public liveness only. No auth, no DB, no secrets — safe
 *    for an uptime probe to poll.
 *  - `?ready=1`: public readiness — core Supabase + Clerk env present (booleans
 *    only). Returns HTTP 503 when core rails are missing. No admin auth.
 *  - `?detail=1` (or `?env=1`): additionally returns a boolean-only env-presence
 *    map, gated behind an admin session. Booleans only — never any secret value.
 *  - `?probe=1`: admin-gated Supabase connectivity + merchants.lat/lng schema
 *    check (coarse reasons only). Can be combined with `?detail=1`.
 *
 * Any non-GET method is 405 (Allow: GET).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wantReady = url.searchParams.get("ready") === "1";
  const wantDetail =
    url.searchParams.get("detail") === "1" || url.searchParams.get("env") === "1";
  const wantProbe = url.searchParams.get("probe") === "1";

  if (wantReady) {
    const ready = readiness();
    return NextResponse.json(
      { ...liveness(), ...ready },
      { status: ready.status === "ready" ? 200 : 503 }
    );
  }

  const body: Record<string, unknown> = { ...liveness() };

  if (wantDetail || wantProbe) {
    // Env presence / DB probe are operational detail — gate behind admin.
    // A signed-out or non-admin caller still gets a 401/403 here, never the map.
    const auth = await requireAdminApi();
    if ("error" in auth) return auth.error;
    if (wantDetail) body.env = envPresence();
    if (wantProbe) body.supabase = await probeSupabase();
  }

  return NextResponse.json(body);
}

// POST/PUT/etc. — healthz is read-only.
export async function POST() {
  return new NextResponse(null, { status: 405, headers: { Allow: "GET" } });
}
