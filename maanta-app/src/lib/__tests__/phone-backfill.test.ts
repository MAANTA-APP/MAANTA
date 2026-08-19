import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAppUser } from "@/lib/auth";

/**
 * D129 — `public.users.phone` is written once at provisioning, so an email-first
 * signup keeps a NULL column forever, and `getMerchantContext`'s pre-invited
 * staff-seat link (`if (!staff && user.phone)`) silently never runs.
 *
 * This file pins both halves: the cause (the NULL-only backfill in
 * `ensureAppUserFromClerk`) and the consequence (a seat that links once the
 * column is filled and does not link while it is NULL). The consequence half is
 * the one that matters — a guard that only proves the write happened would pass
 * against code where the seat still never links.
 */

const currentUserMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: "clerk_user_1" }),
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
 * Fluent service-client stub. Records every `update()` payload so a test can
 * assert that no write was attempted at all, not merely that nothing changed.
 */
type Result = { data: unknown; error: { code?: string } | null };
let selectResult: Result;
let updateResult: Result;
const updates: Array<Record<string, unknown>> = [];
const isFilters: Array<[string, unknown]> = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      let updating = false;
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.upsert = () => builder;
      builder.update = (payload: Record<string, unknown>) => {
        updating = true;
        updates.push(payload);
        return builder;
      };
      builder.is = (col: string, val: unknown) => {
        isFilters.push([col, val]);
        return builder;
      };
      builder.maybeSingle = () => Promise.resolve(updating ? updateResult : selectResult);
      builder.single = () => Promise.resolve(updating ? updateResult : selectResult);
      return builder;
    },
  }),
}));


const VERIFIED = {
  primaryPhoneNumber: {
    phoneNumber: "+254712345678",
    verification: { status: "verified" },
  },
};

const COLUMNS = "id, clerk_user_id, auth_uid, phone, email, full_name, role";

beforeEach(() => {
  updates.length = 0;
  isFilters.length = 0;
  currentUserMock.mockReset();
  selectResult = { data: null, error: null };
  updateResult = { data: null, error: null };
});

describe("ensureAppUser — NULL-only users.phone backfill (D129)", () => {
  it("writes the verified Clerk phone when the column is NULL and returns the updated row", async () => {
    selectResult = { data: { id: "u1", role: "customer", phone: null }, error: null };
    updateResult = {
      data: { id: "u1", role: "merchant_staff", phone: "+254712345678" },
      error: null,
    };
    currentUserMock.mockResolvedValue(VERIFIED);

    const user = await ensureAppUser<{ id: string; phone: string | null }>(COLUMNS);

    expect(updates).toEqual([{ phone: "+254712345678" }]);
    expect(user?.phone).toBe("+254712345678");
  });

  it("leaves the column NULL when Clerk's primary phone is unverified (D126's rule)", async () => {
    selectResult = { data: { id: "u1", role: "customer", phone: null }, error: null };
    currentUserMock.mockResolvedValue({
      primaryPhoneNumber: {
        phoneNumber: "+254712345678",
        verification: { status: "unverified" },
      },
    });

    const user = await ensureAppUser<{ id: string; phone: string | null }>(COLUMNS);

    expect(updates).toEqual([]);
    expect(user?.phone).toBeNull();
  });

  it("never overwrites a phone that is already set, even when Clerk holds a different one", async () => {
    selectResult = {
      data: { id: "u1", role: "customer", phone: "+254700000001" },
      error: null,
    };
    currentUserMock.mockResolvedValue(VERIFIED);

    const user = await ensureAppUser<{ id: string; phone: string | null }>(COLUMNS);

    // No write attempted at all — the column is frozen against change by D124 for
    // the holder, and a sign-in is not the admin identity event that may move it.
    expect(updates).toEqual([]);
    expect(currentUserMock).not.toHaveBeenCalled();
    expect(user?.phone).toBe("+254700000001");
  });

  it("guards the write with .is('phone', null) and keeps the read row when it loses the race", async () => {
    selectResult = { data: { id: "u1", role: "customer", phone: null }, error: null };
    updateResult = { data: null, error: null }; // matched no row: someone else won
    currentUserMock.mockResolvedValue(VERIFIED);

    const user = await ensureAppUser<{ id: string; phone: string | null }>(COLUMNS);

    expect(isFilters).toContainEqual(["phone", null]);
    expect(user?.id).toBe("u1");
    expect(user?.phone).toBeNull();
  });

  it("degrades to the un-backfilled row on a users_phone_key collision rather than throwing", async () => {
    selectResult = { data: { id: "u1", role: "customer", phone: null }, error: null };
    updateResult = { data: null, error: { code: "23505" } };
    currentUserMock.mockResolvedValue(VERIFIED);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const user = await ensureAppUser<{ id: string; phone: string | null }>(COLUMNS);

    expect(user?.id).toBe("u1");
    // The collision is reported, and the number itself never reaches the log (D85).
    expect(logged).toHaveBeenCalledWith("users.phone backfill skipped", { code: "23505" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("254712345678");
    logged.mockRestore();
  });

  it("does not call Clerk at all when the caller did not ask for the phone column", async () => {
    selectResult = { data: { id: "u1", role: "customer" }, error: null };
    currentUserMock.mockResolvedValue(VERIFIED);

    await ensureAppUser<{ id: string }>("id");

    expect(currentUserMock).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("canonicalises a non-E.164 verified Clerk number so both sides of the staff match agree (D127)", async () => {
    selectResult = { data: { id: "u1", role: "customer", phone: null }, error: null };
    updateResult = { data: { id: "u1", role: "customer", phone: "+254712345678" }, error: null };
    currentUserMock.mockResolvedValue({
      primaryPhoneNumber: {
        phoneNumber: "0712 345 678",
        verification: { status: "verified" },
      },
    });

    await ensureAppUser<{ id: string }>(COLUMNS);

    expect(updates).toEqual([{ phone: "+254712345678" }]);
  });
});

describe("getAppUser column list — the coupling the backfill gate depends on", () => {
  it("asks for phone, so the backfill runs on the path getMerchantContext uses", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../data.ts", import.meta.url), "utf8")
    );
    const call = source.match(/export async function getAppUser[\s\S]*?\);/);
    expect(call?.[0]).toContain("phone");
  });
});
