# `src/lib` — shared server libs

Contributor rules for the modules here. These mirror the enforcement philosophy
in `docs/skills/money-trust-engineering-guardrails.md`: a trust-critical value
is computed/enforced in exactly **one** place so the surfaces can't drift.

## Public / shopper reads: use the canonical visibility helper

Shopper- and public-facing reads run through the **service client**
(`supabase/service.ts`), which **bypasses RLS**. That means the page — not the
database — is responsible for hiding non-public merchants and their deals. The
canonical public predicate is:

```
status = 'active'  AND  is_visible = TRUE  AND  is_shadow_banned = FALSE
```

All three clauses are load-bearing: `is_visible` is trust-metric driven and
**independent** of shadow-ban, so dropping any one exposes rows the database
treats as non-public.

**Do not hand-roll this predicate.** Any query that reads `deals` or
`merchants` for a shopper/public surface must go through one of the helpers in
`data.ts`:

- `withPublicMerchant(query)` — for a `deals` query with a `merchants!inner`
  join (prefixes the clauses as `merchants.*`).
- `withPublicMerchantRows(query)` — for a `merchants` base-table query.

```ts
// deals
const q = withPublicMerchant(
  service.from("deals").select(DEAL_SELECT).eq("is_active", true)
);
// merchants
const { data } = await withPublicMerchantRows(
  service.from("merchants").select("id, merchant_name").eq("id", id)
).maybeSingle();
```

This matches the RLS policies, the `*_public_browse` views, and `claim_deal`'s
**merchant** gate, so a shopper can never see a deal from a merchant who is not
active, not visible, or shadow-banned.

**It does not mean everything visible is claimable, and must not be widened to.**
`claim_deal` refuses on per-deal state these helpers deliberately do not filter —
`deal_claim_limit_reached` above all. A fully claimed deal is legitimate
discovery and history content: `getLiveDeals` returns it on purpose and
`/deals/[id]` renders it as "Fully claimed" with claiming disabled. A surface
that advertises an **available claim opportunity** filters it out itself, as
`endingSoonDeals` does. See "Discoverable is not claimable" in `CLAUDE.md`.

`getLiveDeals`,
`getDeal`, search, the public shop page and the BBS Mall counts all use these
helpers — copy that pattern, don't reinvent it. A regression test in
`__tests__/visibility.test.ts` pins the exact clauses.

## The success fee is config-driven, never a literal

The KES 30 success fee lives in `app_config`; read it with `getSuccessFee()`
(`data.ts`). **Never hardcode `KES 30`** in a merchant-facing product surface —
if the fee ever changes (a frozen-business-rule decision), the copy must follow
automatically. Merchant app surfaces (redeem, wallet, plan, onboarding, support)
all read `getSuccessFee()`. The only place the literal `30` appears is that
function's fallback when config is missing.

Exception: `(public)/*` marketing pages carry the fee as **founder-approved
static copy** — the fee is frozen, and changing it triggers a marketing copy
review anyway, so those are intentionally not wired to config.
