import { describe, expect, it } from "vitest";
import {
  SHOPPER_INVENTORY_BYPASS_COOKIE,
  SHOPPER_INVENTORY_BYPASS_MAX_AGE_SECONDS,
} from "@/lib/shopper-inventory";

import { POST } from "../route";

describe("POST /api/shopper/inventory-refresh", () => {
  it("issues a short-lived HttpOnly bypass marker for the next RSC read", async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const cookie = res.cookies.get(SHOPPER_INVENTORY_BYPASS_COOKIE);
    expect(cookie?.value).toBe("1");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.maxAge).toBe(SHOPPER_INVENTORY_BYPASS_MAX_AGE_SECONDS);
  });
});
