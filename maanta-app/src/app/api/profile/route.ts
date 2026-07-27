import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { ensureAppUser, currentClerkUserId } from "@/lib/auth";
import { isClerkAuth } from "@/lib/auth/strategy";
import { createServiceClient } from "@/lib/supabase/service";
import { ALL_NODES, DEFAULT_NODE, NODES, NODE_COOKIE } from "@/lib/nodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  firstName?: string;
  lastName?: string;
  preferredLanguage?: string;
  node?: string;
  /** When true, only preferredLanguage (+ optional node) are updated. */
  languageOnly?: boolean;
};

/**
 * PATCH /api/profile — update shopper name + language on public.users,
 * mirror first/last name to Clerk when possible, and optionally set mall cookie.
 */
export async function PATCH(request: Request) {
  const appUser = await ensureAppUser<{ id: string; full_name: string | null }>(
    "id, full_name"
  );
  if (!appUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const preferredLanguage =
    body.preferredLanguage === "sw" || body.preferredLanguage === "en"
      ? body.preferredLanguage
      : undefined;

  const service = createServiceClient();
  const patch: Record<string, string> = {};

  if (!body.languageOnly) {
    const firstName = (body.firstName ?? "").trim();
    const lastName = (body.lastName ?? "").trim();
    if (!firstName) {
      return NextResponse.json({ error: "First name is required." }, { status: 400 });
    }
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    patch.full_name = fullName;

    const clerkId = isClerkAuth() ? await currentClerkUserId() : null;
    if (clerkId) {
      try {
        const client = await clerkClient();
        await client.users.updateUser(clerkId, {
          firstName,
          lastName: lastName || undefined,
        });
      } catch {
        // Clerk mirror is best-effort; Supabase row is source of truth for the app.
      }
    }
  }

  if (preferredLanguage) {
    patch.preferred_language = preferredLanguage;
  }

  if (Object.keys(patch).length > 0) {
    let { error } = await service.from("users").update(patch).eq("id", appUser.id);
    // If preferred_language column isn't migrated yet, retry without it.
    if (
      error &&
      patch.preferred_language &&
      /preferred_language|schema cache|does not exist/i.test(error.message ?? "")
    ) {
      const rest = { ...patch };
      delete rest.preferred_language;
      if (Object.keys(rest).length === 0) {
        return NextResponse.json({
          ok: true,
          fullName: appUser.full_name,
          preferredLanguage: null,
          warning: "language_column_missing",
        });
      }
      ({ error } = await service.from("users").update(rest).eq("id", appUser.id));
    }
    if (error) {
      return NextResponse.json({ error: "Could not save profile." }, { status: 500 });
    }
  }

  if (typeof body.node === "string") {
    const node =
      body.node === ALL_NODES || NODES.some((n) => n.id === body.node && n.live)
        ? body.node
        : DEFAULT_NODE;
    cookies().set(NODE_COOKIE, encodeURIComponent(node), {
      path: "/",
      maxAge: 31536000,
    });
  }

  return NextResponse.json({
    ok: true,
    fullName: patch.full_name ?? appUser.full_name,
    preferredLanguage: preferredLanguage ?? null,
  });
}
