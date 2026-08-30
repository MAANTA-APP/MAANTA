import { NextResponse } from "next/server";
import {
  SHOPPER_INVENTORY_BYPASS_COOKIE,
  SHOPPER_INVENTORY_BYPASS_MAX_AGE_SECONDS,
} from "@/lib/shopper-inventory";

/**
 * Mark only this shopper's immediately-following RSC read as fresh. Global tag
 * invalidation here would let every open client evict the shared node cache on
 * every poll, defeating the cache and producing a thundering herd.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SHOPPER_INVENTORY_BYPASS_COOKIE,
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SHOPPER_INVENTORY_BYPASS_MAX_AGE_SECONDS,
  });
  return response;
}
