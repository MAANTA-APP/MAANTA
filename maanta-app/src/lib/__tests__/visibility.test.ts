import { describe, it, expect } from "vitest";
import { withPublicMerchant, withPublicMerchantRows } from "@/lib/data";

/**
 * The canonical public-visibility predicate is load-bearing security: all three
 * clauses (status='active', is_visible=true, is_shadow_banned=false) must be
 * applied, because is_visible is trust-driven and independent of shadow-ban.
 * These tests pin the exact filters so a future edit can't silently drop one
 * (which is how search once leaked shadow-banned merchants).
 */

type Call = [string, unknown];

/** Minimal chainable stand-in for a Supabase filter builder. */
function fakeQuery() {
  const calls: Call[] = [];
  const chain = {
    calls,
    eq(column: string, value: unknown) {
      calls.push([column, value]);
      return chain;
    },
  };
  return chain;
}

describe("withPublicMerchant (deals join)", () => {
  it("applies exactly the three merchant clauses, prefixed for the join", () => {
    const q = fakeQuery();
    const out = withPublicMerchant(q);
    expect(out).toBe(q); // passthrough — chains onto the same builder
    expect(q.calls).toEqual([
      ["merchants.status", "active"],
      ["merchants.is_visible", true],
      ["merchants.is_shadow_banned", false],
    ]);
  });
});

describe("withPublicMerchantRows (merchants base table)", () => {
  it("applies exactly the three merchant clauses, unprefixed", () => {
    const q = fakeQuery();
    const out = withPublicMerchantRows(q);
    expect(out).toBe(q);
    expect(q.calls).toEqual([
      ["status", "active"],
      ["is_visible", true],
      ["is_shadow_banned", false],
    ]);
  });
});
