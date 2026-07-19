# merchant_staff billing-toggle reconciliation (2026-07-16)

**Session type:** Security / Reviewer (verification & reconciliation, no product changes)
**Question:** Are `merchant_staff.can_topup` and `merchant_staff.can_purchase` real
authority, dead schema, or misleading partial wiring — and does the frozen rule
"staff cannot touch billing / top-ups / boosts" still hold in practice?

**Verdict (short):** The frozen rule **holds in practice today**, but *not because of
these toggles*. `can_topup` is a **dead field** (never read for enforcement anywhere).
`can_purchase` is **partially wired but redundant** (read at the API layer, but the DB
RPC is the real gate and blocks staff regardless). The top-up block is **incidental**
(owner-only merchant resolution), which is a latent trap for future changes.

> **Update — 2026-07-19 (Fix applied): the latent trap is closed.**
> `/api/topup` and `/api/topup/stripe` now resolve context via `requireMerchant()`
> and **hard-require `isOwner`** (staff get an explicit **403**, not the old incidental
> 404); the `/merchant/topup` page redirects non-owners. Behaviour is unchanged —
> top-up is still owner-only — but the exclusion is now **intentional** and survives a
> future refactor of the merchant-resolution path. `can_topup` is **deliberately still
> not consulted**: it is owner-settable, and the frozen rule only opens staff billing via
> a governance (decisions-log) change, never an owner flag. So `can_topup` remains a
> documented-inactive field. `can_purchase` is unchanged (still redundant to the
> owner/admin-only boost RPCs). See the 2026-07-19 decisions-log entry. The rest of this
> document records the pre-fix findings.

---

## 1. The two server-side enforcement patterns

The codebase gates merchant routes in two different ways, and this is the whole story.

### Pattern A — owner-only *by construction* (raw route, no permission concept)
Used by the **billing/payment** routes:
- `src/app/api/topup/route.ts` (M-Pesa STK top-up)
- `src/app/api/topup/stripe/route.ts` (Stripe checkout top-up)
- `src/app/api/redemptions/verify/route.ts` (success-fee debit)

Each does, in order:
1. `supabase.auth.getUser()` → session user.
2. Load `users` row, require `role ∈ {merchant_admin, merchant_staff}`. **Staff pass this.**
3. Resolve merchant with `.from("merchants").select(...).eq("user_id", appUser.id)`.
   `merchants.user_id` is the **owner**. A staff user's id never matches it →
   `merchant` is `null` → **404 "No merchant account found."**

Net effect: a `merchant_staff` user is stopped at step 3 with a 404. `can_topup` /
`can_purchase` are **never referenced** in this pattern. The block is a side effect of
resolving the merchant by ownership, not an intentional billing gate.

### Pattern B — context-aware `requireMerchant(permission)`
Used by `src/app/api/boosts/route.ts`, `src/app/api/boosts/move/route.ts`,
`src/app/api/deals/route.ts`, `src/app/api/wallet/route.ts`.
`requireMerchant` (`src/lib/merchant-api.ts`) calls `getMerchantContext()`
(`src/lib/merchant.ts`), which resolves **owner OR invited staff**, then checks
`permissions[permission]`. Owners get `OWNER_PERMISSIONS` (all true); staff get their
row's toggles.

- `/api/boosts` and `/api/boosts/move` → `requireMerchant("can_purchase")`.
- The RPCs `purchase_boost` / `move_boost`
  (`supabase/migrations/20260709175532_deal_pause_boosts_staff.sql`) are
  `SECURITY DEFINER` and **self-authorizing**: they hard-require the caller to be the
  merchant **owner or admin** (`v_caller_id = owner user_id OR role = 'admin'`), else
  `RAISE EXCEPTION 'unauthorized'`. Grants were locked to `authenticated`/`service_role`
  in `20260710171048_lock_down_boost_and_role_escalation_grants.sql`, but the
  in-function owner/admin check is the real gate.

---

## 2. Core security questions — can staff do it *server-side*?

| Action | Reachable by staff? | Why |
|---|---|---|
| Top up merchant balance (M-Pesa) | **No** | `/api/topup` resolves merchant by owner `user_id` → 404 for staff. `can_topup` not checked. |
| Top up merchant balance (Stripe) | **No** | `/api/topup/stripe` — same owner-only construction → 404. |
| Purchase a boost | **No** | `/api/boosts` needs `can_purchase` (default false); even if true, `purchase_boost` RPC blocks non-owner/non-admin. |
| Move a boost | **No** | `/api/boosts/move` — same as above via `move_boost` RPC. |
| Trigger billing/payment action | **No** | All billing routes are Pattern A (owner-only) or Pattern B + owner-only RPC. |
| Create billing `merchant_transactions` rows | **No** | Written only by `purchase_boost` (owner/admin), `verify_redemption`/`deduct_success_fee` (owner-only route + RPC), `record_merchant_ledger_entry` RPC, and provider **webhooks** (Stripe/IntaSend — provider-authenticated, no user/staff path). None reachable by staff. |

Balance **credits** happen exclusively through provider webhooks
(`src/app/api/webhooks/stripe`, IntaSend), which authenticate the payment provider, not
a user — so staff have no path there either.

---

## 3. Toggle classification

**`can_topup` → DEAD FIELD (present but unused for enforcement).**
No server route reads it. It is only: defined in the migration, carried through
`StaffPermissions` in `merchant.ts`, displayed on the staff list, and written by the
owner-only staff create/edit routes (`/api/staff`, `/api/staff/[id]`). There is no
`requireMerchant("can_topup")` and the top-up routes don't reference it at all. The
top-up block is provided by unrelated owner-only merchant resolution.

**`can_purchase` → PARTIALLY WIRED / MISLEADING (read but redundant).**
It *is* read — `requireMerchant("can_purchase")` in both boost routes. But it cannot
actually grant a staff member boost authority, because `purchase_boost` / `move_boost`
reject any caller who is not the owner or an admin. So flipping `can_purchase` to true
changes nothing for staff: the DB still blocks them. It reads as if it delegates
boost-purchase authority; it does not.

---

## 4. Frozen-rule verdict

> "Staff categorically cannot access billing / top-ups / boosts unless explicitly
> changed by governance."

**Currently TRUE in practice** — but held together by construction and redundancy, not
by the toggles that appear to govern it:
- Top-ups: blocked by owner-only merchant resolution (incidental).
- Boosts: blocked by the owner/admin-only RPC (the `can_purchase` API check is redundant).

So the *outcome* is correct; the *mechanism* is not the one the schema implies.

### Latent trap (the reason this isn't a clean "all good")
The top-up and verify routes rely on `eq("user_id", …)` to exclude staff. Separately,
staff verification appears **broken by the same construction** (a `can_verify` staff
member also can't reach `/api/redemptions/verify`, since it resolves merchant by owner
`user_id`). The obvious future "fix" — switch these routes to
`requireMerchant(...)`/`getMerchantContext()` so staff can verify — would **also open
top-up to staff**, because there is no `can_topup` gate for them to inherit. The dead
field is a trap: it looks like the guard is already there, but it isn't.

Minor: the `/merchant/topup` **page** renders for staff (it only checks
`getMerchantContext().status === "ok"`), so staff can *see* the balance and the top-up
UI; the submit then fails with a 404. Misleading UX + small balance-visibility exposure,
not a billing breach.

---

## 5. Recommended next action

1. **Document the toggles as inactive** (this doc + a decisions-log line): `can_topup`
   is non-enforcing; `can_purchase` is redundant to the owner/admin RPC gate. Do this
   now so no one assumes they are live authority.
2. **Do not remove the fields this session** — that's a schema change, out of scope.
   Flag them for a later cleanup decision once governance decides whether staff
   billing permissioning is ever intended.
3. **Open a separate hardening/Fix session only if governance wants defense-in-depth:**
   add an explicit server gate (e.g. route through `requireMerchant("can_topup")`) to
   `/api/topup` and `/api/topup/stripe` so the frozen rule is enforced *intentionally*
   rather than incidentally, closing the latent trap before anyone touches staff
   verification. This is a fix — **not done in this session** per the session's
   read/verify-only constraint.

**No product, schema, or behaviour changes were made in this session.**

## Files inspected
- `supabase/migrations/20260709175532_deal_pause_boosts_staff.sql` (merchant_staff table, purchase_boost, move_boost)
- `supabase/migrations/20260710171048_lock_down_boost_and_role_escalation_grants.sql` (boost grants)
- `src/lib/merchant.ts`, `src/lib/merchant-api.ts`
- `src/app/api/topup/route.ts`, `src/app/api/topup/stripe/route.ts`
- `src/app/api/boosts/route.ts`, `src/app/api/boosts/move/route.ts`
- `src/app/api/redemptions/verify/route.ts`, `src/app/api/wallet/route.ts`
- `src/app/api/staff/route.ts`, `src/app/api/staff/[id]/route.ts`
- `src/app/api/deals/route.ts`
- `src/app/merchant/(app)/topup/page.tsx`, `.../topup/topup-flow.tsx`, `.../(app)/layout.tsx`, staff pages
