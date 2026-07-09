import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validateWaitlistSignup } from "@/lib/waitlist";

// Best-effort per-IP throttle. In-memory, so each serverless instance keeps
// its own window — good enough to blunt naive form spam, NOT a security
// boundary (the honeypot + unique constraint carry the rest). Move to a
// shared store if abuse actually shows up.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const hits = new Map<string, { windowStart: number; count: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    hits.set(ip, { windowStart: now, count: 1 });
    // Opportunistic cleanup so the map can't grow unbounded.
    if (hits.size > 10_000) {
      hits.forEach((value, key) => {
        if (now - value.windowStart > RATE_LIMIT_WINDOW_MS) hits.delete(key);
      });
    }
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts — please try again in a minute." },
      { status: 429 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = validateWaitlistSignup(payload);
  if (!result.ok) {
    // Bots that filled the honeypot get a success response and no row —
    // telling them they were caught just trains them around it.
    if (result.error === "honeypot") {
      return NextResponse.json({ joined: true });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from("waitlist_signups").insert({
    ...result.row,
    consent_at: new Date().toISOString(),
  });

  if (error) {
    // unique_violation on (email, segment_type): they're already on this
    // list. That's a success from the visitor's point of view; the original
    // row (and its first-touch attribution) is left untouched.
    if (error.code === "23505") {
      return NextResponse.json({ joined: true, alreadyJoined: true });
    }
    console.error("waitlist insert failed:", error);
    return NextResponse.json(
      { error: "Could not save your signup — please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ joined: true });
}
