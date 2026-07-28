import { NextResponse } from "next/server";
import { ensureAppUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me — signed-in app profile fields needed by client bootstraps
 * (role for `/app-bootstrap`). Not a general profile CRUD endpoint.
 */
export async function GET() {
  const user = await ensureAppUser<{ id: string; role: string }>("id, role");
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return NextResponse.json({ id: user.id, role: user.role });
}
