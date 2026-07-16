# Skill / audit note — `merchant_staff` billing-toggle reconciliation

**Session type:** Reviewer / Security (read + trace + live-verify, no code change)
**Date:** 2026-07-16
**Scope:** Are `merchant_staff.can_topup` and `merchant_staff.can_purchase`
real server-side authority? Does the frozen rule *"staff cannot touch
billing / top-ups / boosts"* hold in practice?
**Live project verified:** `vcrfqsevompqjazbwzyh`

## Verdict (one line)

The frozen staff-billing prohibition **currently holds in practice**, but it
holds by *incidental* enforcement, not by these toggles. **`can_topup` is a
dead field** (never consulted anywhere server-side) and **`can_purchase` is
misleading partial wiring** (checked at the API guard, then overridden by an
owner/admin-only RPC floor). Neither toggle is real authority. Document now;
no emergency fix required.

## Every billing-related path inspected

| Path | Entry | Can staff reach it? | Does it consult `can_topup`/`can_purchase`? | What actually gates it |
|---|---|---|---|---|
| Start M-Pesa top-up | `POST /api/topup` | **No** | No | Inline `role ∈ {merchant_admin, merchant_staff}` check *passes* for staff, but merchant lookup is `merchants.user_id = appUser.id` (owner-only) → staff get 404 `No merchant account found` |
| Start Stripe top-up | `POST /api/topup/stripe` | **No** | No | Same owner-only lookup as above |
| Credit wallet after payment | `record_merchant_ledger_entry` RPC (webhooks) | **No** | No | `SECURITY DEFINER`, **service_role-only** (`RAISE unauthorized: service_role only`; EXECUTE granted to `service_role` only) |
| Purchase 24h boost | `POST /api/boosts` → `purchase_boost` RPC | **No** | **Yes at API guard only** | `requireMerchant("can_purchase")` *would* pass a staff member with the toggle on — but the RPC is `SECURITY DEFINER` and rejects any non-owner/non-admin: `unauthorized: not merchant owner or admin` |
| Move boost window | `POST /api/boosts/move` → `move_boost` RPC | **No** | **Yes at API guard only** | Same API guard + same owner/admin RPC floor |
| Direct write to `merchant_transactions` | table RLS | **No** | n/a | **Only a `SELECT` policy exists** (`transactions_merchant`). No INSERT/UPDATE/DELETE policy → only `service_role`/DEFINER RPCs can write billing rows |
| Direct write to `boost_flags` | table RLS | **No** | n/a | `boost_flags_merchant` FOR ALL, owner-or-admin only |
| Direct update of `merchants.account_balance` | table RLS | **No** | n/a | `merchants_own` / `merchants_admin` FOR ALL, owner-or-admin only; plus `account_balance >= 0` CHECK |
| Read wallet | `GET /api/wallet` → `requireMerchant()` (no perm) | Yes (read-only) | No | Read-only KPI/balance view; not a billing action |

## Toggle classification

### `can_topup` — **DEAD SCHEMA / unused field**
- **Written**: `POST /api/staff` (create) and `PATCH /api/staff/[id]` (update) set it; `getMerchantContext()` reads it into the permissions object; staff UI (`/merchant/staff`) renders it as a "Top up" chip.
- **Never enforced**: no route calls `requireMerchant("can_topup")`; the two top-up routes don't use `requireMerchant` at all and never reference the field. Grep for `can_topup` in `src/` returns only the type def, the context read, the UI label, and the write paths — **zero enforcement reads**.
- Staff are blocked from top-ups purely by the **owner-only merchant lookup** in the top-up routes, which has nothing to do with `can_topup`. The toggle could be flipped on or off with no behavioural change.

### `can_purchase` — **PARTIALLY WIRED / MISLEADING**
- **Enforced at the API guard**: both boost routes call `requireMerchant("can_purchase")`, so a staff member with the toggle *off* is correctly 403'd there.
- **But overridden below**: `purchase_boost` / `move_boost` are `SECURITY DEFINER` and self-authorize as **owner-or-admin only** (`v_caller_id IS DISTINCT FROM v_owner_user_id`). The routes call them via the *user-authed* client (`createClient()`), so a staff member's identity hits that check. Result: a staff member with `can_purchase = true` passes the app gate and is then rejected by the RPC with `unauthorized: not merchant owner or admin`.
- **Net effect**: `can_purchase = true` never actually grants boost authority. The toggle advertises a delegation the enforcement floor silently refuses. That is the misleading part — a merchant owner could enable it expecting to delegate boosts and see only 403s.

## Live verification (read-only, project `vcrfqsevompqjazbwzyh`)

- `purchase_boost`, `move_boost`, `deduct_success_fee_or_record_arrears`: deployed bodies contain the **owner/admin check**, and do **not** reference `merchant_staff` or `can_purchase`. Grants: `authenticated` + `service_role` (a staff member *can* invoke them, but the in-body identity check rejects non-owners).
- `record_merchant_ledger_entry`: deployed body is **service_role-only**; EXECUTE granted to `service_role` only (no `authenticated` grant).
- `merchant_transactions` RLS: exactly one policy, `SELECT` only. No write policy live. `boost_flags` and `merchants` writes are owner/admin only. All matches the migrations.
- `merchant_staff` currently has **0 rows** in production (0 with `can_topup`, 0 with `can_purchase`, 0 linked users). So the staff surface is entirely unused today — the frozen rule also holds **vacuously** right now.

## Does the frozen rule hold?

**Yes — TRUE in practice.** No server-side path lets staff top up, credit a
wallet, purchase/move a boost, or write a billing row. It holds through four
independent floors (owner-only top-up lookup, owner/admin RPC checks on
boosts, service_role-only ledger RPC, and RLS with no INSERT on
`merchant_transactions`) plus the fact that no staff rows exist yet.

**Caveat:** it holds *despite* the toggles, not *because* of them. The schema
advertises delegatable billing authority (`can_topup`, `can_purchase`) that
the enforcement layer refuses. That is a governance/documentation drift and a
latent footgun, not a live breach.

## Recommendation

**Document as inactive now (this note). No immediate Security/Fix session.**
Reasons: rule holds on every path, 0 staff exist, and neither toggle can be
exploited to reach billing.

Two follow-up risks worth a **decisions-log entry** (not urgent):

1. **`can_purchase` API-gate vs RPC-floor mismatch is a refactor trap.** A
   future dev "fixing" the toggle so it works (e.g. loosening the
   `purchase_boost` owner check to honour staff `can_purchase`) would punch a
   hole straight through the frozen rule. The safe direction is the reverse:
   drop the `requireMerchant("can_purchase")` pretence and/or remove the
   toggle so the schema stops advertising delegation.
2. **`can_topup` should be removed or hidden.** It is pure decoration today
   and misrepresents the security model in the staff UI.

If delegation of billing to staff is ever genuinely wanted, that **reverses a
frozen rule** and requires a new `docs/maanta-decisions-log.md` entry first —
it must not be introduced by quietly making these toggles "work."

## Pointers for the next session

- API guard: `maanta-app/src/lib/merchant-api.ts` (`requireMerchant`)
- Context/permission resolution: `maanta-app/src/lib/merchant.ts` (`getMerchantContext`, `OWNER_PERMISSIONS`)
- Top-up routes (owner-only, no toggle read): `src/app/api/topup/route.ts`, `src/app/api/topup/stripe/route.ts`
- Boost routes (guard vs RPC-floor mismatch): `src/app/api/boosts/route.ts`, `src/app/api/boosts/move/route.ts`
- RPC floors: `supabase/migrations/20260709175532_deal_pause_boosts_staff.sql` (purchase_boost/move_boost), `20260709000211_record_merchant_ledger_entry_rpc.sql`, `20260710171048_lock_down_boost_and_role_escalation_grants.sql`
- Schema/RLS: `supabase/migrations/20260630231915_maanta_schema_v3_baseline.sql`
