import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAppUser, verifiedPrimaryEmail } from "@/lib/auth";

/**
 * D108's prevention half — founder ruling A, 2026-08-19 (decision-queue Q1).
 *
 * A Clerk `sub` is scoped to the instance that minted it. After an instance
 * change every returning person misses the `clerk_user_id` lookup and used to
 * get one of two accidents: a silent second empty account, or (once D129
 * populated `users.phone`) a `users_phone_key` violation and no account at all.
 *
 * The ruled fallback: when the sub misses and the caller holds a Clerk-VERIFIED
 * email, match it against real rows only — and only an exactly-one match may
 * relink. Zero matches fall through to a fresh insert; more than one is a HARD
 * FAILURE (null, loud), never a guess. These tests pin every branch of that
 * rule, because each one is a security property: verified-only is what stops a
 * signup carrying someone else's unverified address from becoming a relink
 * target, single-match is what stops a wrong link handing over another person's
 * claims or role, and the demo filter is what stops a real person being linked
 * into a synthetic seed row.
 */

const currentUserMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: "sub_new_instance" }),
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

/**
 * Recording stub. Each `from("users")` call becomes one query whose filters and
 * writes are captured, and whose result is dequeued from `results` — so a test
 * states the database's answers up front and asserts exactly which queries ran.
 */
type Result = { data: unknown; error: { code?: string } | null };
type Query = {
  filters: Array<[string, unknown]>;
  update: Record<string, unknown> | null;
  upsert: Record<string, unknown> | null;
  limit: number | null;
};
let results: Result[];
let queries: Query[];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const q: Query = { filters: [], update: null, upsert: null, limit: null };
      queries.push(q);
      const resolve = () => Promise.resolve(results.shift() ?? { data: null, error: null });
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (c: string, v: unknown) => (q.filters.push([c, v]), builder);
      builder.is = (c: string, v: unknown) => (q.filters.push([c, v]), builder);
      builder.limit = (n: number) => ((q.limit = n), builder);
      builder.update = (payload: Record<string, unknown>) => ((q.update = payload), builder);
      builder.upsert = (payload: Record<string, unknown>) => ((q.upsert = payload), builder);
      builder.maybeSingle = resolve;
      builder.single = resolve;
      builder.then = (onOk: (v: unknown) => unknown) => resolve().then(onOk);
      return builder;
    },
  }),
}));

const CLERK_USER = {
  primaryEmailAddress: {
    emailAddress: "Owner@Example.com",
    verification: { status: "verified" },
  },
  primaryPhoneNumber: null,
  firstName: "Shop",
  lastName: "Owner",
};

const COLUMNS = "id, role, phone, email";

beforeEach(() => {
  results = [];
  queries = [];
  currentUserMock.mockReset();
  currentUserMock.mockResolvedValue(CLERK_USER);
});

describe("verifiedPrimaryEmail", () => {
  it("returns the lowercased address when verified", () => {
    expect(verifiedPrimaryEmail(CLERK_USER)).toBe("owner@example.com");
  });

  it("returns null when unverified, missing verification, or absent", () => {
    expect(
      verifiedPrimaryEmail({
        primaryEmailAddress: { emailAddress: "a@b.c", verification: { status: "unverified" } },
      })
    ).toBeNull();
    expect(verifiedPrimaryEmail({ primaryEmailAddress: { emailAddress: "a@b.c" } })).toBeNull();
    expect(verifiedPrimaryEmail({ primaryEmailAddress: null })).toBeNull();
    expect(verifiedPrimaryEmail(null)).toBeNull();
  });

  it("returns null for a verified entry with no address", () => {
    expect(
      verifiedPrimaryEmail({ primaryEmailAddress: { verification: { status: "verified" } } })
    ).toBeNull();
  });
});

describe("ensureAppUser — verified-email relink on a sub miss (D108 / ruling A)", () => {
  it("relinks the single real matching row, re-enters by sub, and never inserts", async () => {
    results = [
      { data: null, error: null }, // sub lookup: miss
      { data: [{ id: "u-old" }], error: null }, // email match: exactly one
      { data: { id: "u-old" }, error: null }, // relink update succeeds
      // Re-entry: the sub now matches, so the ordinary existing-row path — the
      // D129 phone backfill included — serves the request.
      { data: { id: "u-old", role: "merchant_admin", phone: "+254712345678", email: "owner@example.com" }, error: null },
    ];

    const user = await ensureAppUser<{ id: string; role: string }>(COLUMNS);

    expect(user?.id).toBe("u-old");
    expect(user?.role).toBe("merchant_admin"); // the whole point: the old account, role intact
    const [, emailQuery, relink, reentry] = queries;
    // Verified, lowercased, real rows only.
    expect(emailQuery.filters).toContainEqual(["email", "owner@example.com"]);
    expect(emailQuery.filters).toContainEqual(["is_demo", false]);
    expect(emailQuery.limit).toBe(2);
    // The relink writes the new sub onto the matched row, by id.
    expect(relink.update).toEqual({ clerk_user_id: "sub_new_instance" });
    expect(relink.filters).toContainEqual(["id", "u-old"]);
    expect(reentry.filters).toContainEqual(["clerk_user_id", "sub_new_instance"]);
    // Nothing was inserted.
    expect(queries).toHaveLength(4);
    expect(queries.some((q) => q.upsert)).toBe(false);
  });

  it("the re-entry cannot relink twice — a second miss goes straight to the insert", async () => {
    // Pathological race: the relink reports success but the row vanishes before
    // the re-entry reads it. Without the one-shot flag this would loop back into
    // the email match forever; with it, the second pass inserts.
    results = [
      { data: null, error: null }, // sub miss
      { data: [{ id: "u-old" }], error: null }, // one match
      { data: { id: "u-old" }, error: null }, // relink "succeeds"
      { data: null, error: null }, // re-entry sub lookup: row gone
      { data: { id: "u-new", role: "customer" }, error: null }, // insert
    ];

    const user = await ensureAppUser<{ id: string }>(COLUMNS);

    expect(user?.id).toBe("u-new");
    expect(queries).toHaveLength(5);
    // Exactly one email-match query across both passes.
    expect(queries.filter((q) => q.filters.some(([c]) => c === "email"))).toHaveLength(1);
  });

  it("hard-fails on an ambiguous match — null, no write, no insert", async () => {
    results = [
      { data: null, error: null }, // sub miss
      { data: [{ id: "u-1" }, { id: "u-2" }], error: null }, // two matches
    ];
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const user = await ensureAppUser<{ id: string }>(COLUMNS);

    expect(user).toBeNull();
    expect(queries).toHaveLength(2);
    expect(queries.some((q) => q.update || q.upsert)).toBe(false);
    // The shape is logged; the address never is (D85 — email is PII).
    expect(logged).toHaveBeenCalledWith("verified-email relink ambiguous", { matches: 2 });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("example.com");
    logged.mockRestore();
  });

  it("falls through to a fresh insert when no row matches", async () => {
    results = [
      { data: null, error: null }, // sub miss
      { data: [], error: null }, // zero matches
      { data: { id: "u-new", role: "customer" }, error: null }, // upsert
    ];

    const user = await ensureAppUser<{ id: string }>(COLUMNS);

    expect(user?.id).toBe("u-new");
    const insert = queries[2];
    expect(insert.upsert).toMatchObject({
      clerk_user_id: "sub_new_instance",
      // The stored mirror is the verified, lowercased address — the same value
      // the relink matches on, so the two ends of the rule cannot diverge.
      email: "owner@example.com",
      role: "customer",
    });
  });

  it("skips the fallback entirely when the email is unverified", async () => {
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: "owner@example.com",
        verification: { status: "unverified" },
      },
    });
    results = [
      { data: null, error: null }, // sub miss
      { data: { id: "u-new", role: "customer" }, error: null }, // upsert directly
    ];

    const user = await ensureAppUser<{ id: string }>(COLUMNS);

    expect(user?.id).toBe("u-new");
    // Exactly two queries: no email lookup happened at all — and the stored
    // email mirror is null, because an unverified address is not identity.
    expect(queries).toHaveLength(2);
    expect(queries[1].upsert).toMatchObject({ email: null });
  });

  it("recovers the row by sub when the relink update races", async () => {
    results = [
      { data: null, error: null }, // sub miss
      { data: [{ id: "u-old" }], error: null }, // one match
      { data: null, error: { code: "23505" } }, // relink lost the race
      { data: { id: "u-old", role: "customer" }, error: null }, // re-read by sub
    ];

    const user = await ensureAppUser<{ id: string }>(COLUMNS);

    expect(user?.id).toBe("u-old");
    expect(queries[3].filters).toContainEqual(["clerk_user_id", "sub_new_instance"]);
  });

  it("hard-fails when the relink fails and no row carries the sub", async () => {
    results = [
      { data: null, error: null },
      { data: [{ id: "u-old" }], error: null },
      { data: null, error: { code: "23505" } },
      { data: null, error: null }, // re-read finds nothing
    ];
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const user = await ensureAppUser<{ id: string }>(COLUMNS);

    expect(user).toBeNull();
    expect(logged).toHaveBeenCalledWith("verified-email relink failed", { code: "23505" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("example.com");
    logged.mockRestore();
  });

  it("never consults email when the sub matches — the fallback is miss-only", async () => {
    results = [
      { data: { id: "u-1", role: "customer", phone: "+254712345678", email: "owner@example.com" }, error: null },
    ];

    const user = await ensureAppUser<{ id: string }>(COLUMNS);

    expect(user?.id).toBe("u-1");
    expect(queries).toHaveLength(1);
  });
});
