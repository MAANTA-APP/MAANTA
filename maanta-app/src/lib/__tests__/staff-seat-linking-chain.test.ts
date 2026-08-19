import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMerchantContext } from "@/lib/merchant";

/**
 * D129 — the whole chain, end to end, with only Clerk and the database stubbed.
 *
 * `merchant-staff-linking.test.ts` pins `getMerchantContext`'s branch in
 * isolation; that test passes against the broken code, because the defect is
 * upstream of it. This one runs the real `ensureAppUser` → `getAppUser` →
 * `getMerchantContext` path against an in-memory table store shaped like
 * production on 2026-08-19: a user provisioned by email (`users.phone` NULL) who
 * has since verified a phone in Clerk, and a `merchant_staff` seat pre-invited
 * on that same number.
 *
 * Delete the backfill from `ensureAppUserFromClerk` and this file fails: the
 * seat stays unclaimed and the person reaches the counter as a shopper. That is
 * the guard the register's bar asks for — one that would go red if the drift
 * came back.
 */

const currentUserMock = vi.fn();
let clerkSub = "clerk_user_1";
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: clerkSub }),
  currentUser: () => currentUserMock(),
}));

vi.mock("@/lib/auth/strategy", () => ({
  isClerkAuth: () => true,
  isSupabaseAuth: () => false,
  phoneOtpEnabled: () => true,
}));

vi.mock("@/lib/auth/supabase-session", () => ({
  currentSupabaseAuthEmail: () => Promise.resolve(null),
  currentSupabaseAuthUserId: () => Promise.resolve(null),
}));

type Row = Record<string, unknown>;
let store: Record<string, Row[]>;

/**
 * Minimal PostgREST-shaped stub: `.eq`/`.is` accumulate equality filters,
 * `.update` mutates every matching row, and the terminal `.maybeSingle()` (or
 * awaiting the builder) resolves the first match. Enough to run the real code
 * paths; deliberately not a query engine.
 */
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let pending: Row | null = null;
      const matches = () =>
        (store[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      const run = () => {
        const hits = matches();
        if (pending) {
          for (const hit of hits) Object.assign(hit, pending);
        }
        return { data: hits[0] ?? null, error: null };
      };
      let limit: number | null = null;
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (c: string, v: unknown) => (filters.push([c, v]), builder);
      builder.is = (c: string, v: unknown) => (filters.push([c, v]), builder);
      builder.limit = (n: number) => ((limit = n), builder);
      builder.update = (payload: Row) => ((pending = payload), builder);
      builder.maybeSingle = () => Promise.resolve(run());
      builder.single = () => Promise.resolve(run());
      // Awaiting the builder without a terminal returns the LIST, the shape the
      // verified-email relink's match query consumes.
      builder.then = (resolve: (v: unknown) => unknown) => {
        const hits = matches();
        if (pending) for (const hit of hits) Object.assign(hit, pending);
        const rows = limit === null ? hits : hits.slice(0, limit);
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      };
      return builder;
    },
  }),
}));


beforeEach(() => {
  currentUserMock.mockReset();
  clerkSub = "clerk_user_1";
  store = {
    users: [
      {
        id: "u1",
        clerk_user_id: "clerk_user_1",
        auth_uid: null,
        // Email-first signup: no verified phone existed at provisioning.
        phone: null,
        email: "assistant@example.com",
        full_name: "Shop Assistant",
        role: "customer",
        is_demo: false,
      },
    ],
    merchants: [
      { id: "merchant-1", user_id: "owner-1", merchant_name: "SKANDI SKAN", tier: "standard" },
    ],
    merchant_staff: [
      {
        id: "seat-1",
        merchant_id: "merchant-1",
        // Stored canonical by the invite route since D127.
        phone: "+254712345678",
        user_id: null,
        can_verify: true,
        can_deals: false,
        can_topup: false,
        can_purchase: false,
      },
    ],
  };
});

describe("staff seat linking, end to end (D129)", () => {
  it("links the pre-invited seat on the sign-in after the phone is verified in Clerk", async () => {
    currentUserMock.mockResolvedValue({
      primaryPhoneNumber: {
        phoneNumber: "+254712345678",
        verification: { status: "verified" },
      },
    });

    const result = await getMerchantContext();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.ctx.merchant.merchant_name).toBe("SKANDI SKAN");
    expect(result.ctx.isOwner).toBe(false);
    // The seat's permissions are what put the verify keypad on their screen.
    expect(result.ctx.permissions.can_verify).toBe(true);
    // Both sides of the link are now durable, not recomputed every request.
    expect(store.users[0].phone).toBe("+254712345678");
    expect(store.merchant_staff[0].user_id).toBe("u1");
    expect(store.users[0].role).toBe("merchant_staff");
  });

  it("still does not link when Clerk holds no verified phone — the column stays NULL", async () => {
    currentUserMock.mockResolvedValue({
      primaryPhoneNumber: {
        phoneNumber: "+254712345678",
        verification: { status: "unverified" },
      },
    });

    const result = await getMerchantContext();

    expect(result.status).toBe("no-merchant");
    expect(store.users[0].phone).toBeNull();
    expect(store.merchant_staff[0].user_id).toBeNull();
    expect(store.users[0].role).toBe("customer");
  });

  /**
   * The D108 composition, end to end — founder ruling A (2026-08-19). The same
   * person returns after a Clerk INSTANCE change: their old `sub` matches
   * nothing, their email is verified on the new instance, and their phone is
   * verified too. Before the ruling this minted a silent second account (or,
   * post-D129, no account at all). Now: the verified-email relink recovers their
   * OWN row, the phone backfill fills it, and the pre-invited staff seat links —
   * all in the one sign-in, with no second row created.
   */
  it("recovers the account across a Clerk instance change and still links the seat", async () => {
    clerkSub = "sub_from_new_instance"; // the old row holds clerk_user_1 — dead
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: "Assistant@Example.com", // case differs; matching is lowercased
        verification: { status: "verified" },
      },
      primaryPhoneNumber: {
        phoneNumber: "+254712345678",
        verification: { status: "verified" },
      },
      firstName: "Shop",
      lastName: "Assistant",
    });

    const result = await getMerchantContext();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.ctx.permissions.can_verify).toBe(true);
    // The ONE original row was relinked — no duplicate was inserted.
    expect(store.users).toHaveLength(1);
    expect(store.users[0].id).toBe("u1");
    expect(store.users[0].clerk_user_id).toBe("sub_from_new_instance");
    expect(store.users[0].phone).toBe("+254712345678");
    expect(store.merchant_staff[0].user_id).toBe("u1");
  });
});
